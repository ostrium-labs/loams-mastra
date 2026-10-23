// Serve a Mastra agent over the Agent Client Protocol (design loams §72 §4.4, D1426;
// plan FT1, FT0 Task 2).
//
// An ACP client (Loams Studio through loams-agentd, Zed, any other) starts this process
// and talks newline-delimited JSON-RPC on its stdin and stdout:
//
// - `session/new` opens a Mastra thread (thread id = the ACP session id, resource = the
//   client's project, by default its `cwd`);
// - `session/prompt` runs `agent.stream` on that thread; text deltas become
//   `agent_message_chunk`, reasoning becomes `agent_thought_chunk`, tool calls become
//   `tool_call` and `tool_call_update`;
// - a `tool-call-approval` chunk (a tool with `requireApproval`) becomes
//   `session/request_permission`; the person's answer resumes the run with
//   `agent.approveToolCall` or `agent.declineToolCall`;
// - `session/cancel` aborts the running stream, and the prompt ends `cancelled`.
//
// The bridge holds no credential and reads no environment: the model's key is the host
// process's business.
import { randomUUID } from 'node:crypto';
import { Readable, Writable } from 'node:stream';

import * as acp from '@agentclientprotocol/sdk';
import type { Agent } from '@mastra/core/agent';

/** How the ACP `kind` of a tool call is chosen. Unknown tools are `other`. */
export type ToolKindFor = (toolName: string) => acp.ToolKind;

export interface MastraAcpOptions {
  /** The Mastra memory resource for a new session. Defaults to the session's `cwd`. */
  resource?: (params: acp.NewSessionRequest) => string;
  /** The ACP tool kind for a tool name. Defaults to `other`. */
  toolKind?: ToolKindFor;
  /** Name and version reported in `initialize`. */
  agentInfo?: { name: string; version: string };
  /** Upper bound on approval round trips in one prompt (a loop guard). Default 32. */
  maxApprovals?: number;
}

export interface ServeAcpOptions extends MastraAcpOptions {
  /** Defaults to `process.stdin`. */
  stdin?: Readable;
  /** Defaults to `process.stdout`. */
  stdout?: Writable;
}

/** The option ids this bridge offers in `session/request_permission`. */
export const ALLOW_ONCE = 'allow';
export const REJECT_ONCE = 'reject';

interface Session {
  threadId: string;
  resourceId: string;
  /** The running prompt's abort controller. */
  running: AbortController | null;
  /** Without Mastra memory the bridge keeps the turns itself. */
  history: Turn[];
}

type Turn = { role: 'user'; content: string } | { role: 'assistant'; content: string };

type MastraStream = Awaited<ReturnType<Agent['stream']>>;

interface PendingApproval {
  toolCallId: string;
  toolName: string;
  args: unknown;
}

/** The text of a prompt's content blocks, in order. Non-text blocks become references. */
export function promptText(prompt: acp.ContentBlock[]): string {
  const parts: string[] = [];
  for (const block of prompt) {
    switch (block.type) {
      case 'text':
        parts.push(block.text);
        break;
      case 'resource_link':
        parts.push(`[${block.name}](${block.uri})`);
        break;
      case 'resource':
        if ('text' in block.resource) {
          parts.push(`<resource uri="${block.resource.uri}">\n${block.resource.text}\n</resource>`);
        } else {
          parts.push(`[resource ${block.resource.uri}]`);
        }
        break;
      default:
        parts.push(`[${block.type}]`);
    }
  }
  return parts.join('\n');
}

function stringify(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
}

function stripMetadata(args: unknown): unknown {
  if (args && typeof args === 'object' && '__mastraMetadata' in args) {
    const { __mastraMetadata: _, ...rest } = args as Record<string, unknown>;
    return rest;
  }
  return args;
}

/** The ACP side of one Mastra agent. Exported for tests and custom transports. */
export class MastraAcpAgent implements acp.Agent {
  readonly #sessions = new Map<string, Session>();

  constructor(
    private readonly agent: Agent,
    private readonly connection: acp.AgentSideConnection,
    private readonly options: MastraAcpOptions = {},
  ) {}

  initialize(_params: acp.InitializeRequest): acp.InitializeResponse {
    return {
      protocolVersion: acp.PROTOCOL_VERSION,
      agentCapabilities: { loadSession: false },
      agentInfo: this.options.agentInfo ?? { name: this.agent.name, version: '0.0.0' },
    } as acp.InitializeResponse;
  }

  authenticate(_params: acp.AuthenticateRequest): acp.AuthenticateResponse {
    return {};
  }

  newSession(params: acp.NewSessionRequest): acp.NewSessionResponse {
    const sessionId = randomUUID();
    this.#sessions.set(sessionId, {
      threadId: sessionId,
      resourceId: this.options.resource?.(params) ?? params.cwd,
      running: null,
      history: [],
    });
    return { sessionId };
  }

  async cancel(params: acp.CancelNotification): Promise<void> {
    this.#sessions.get(params.sessionId)?.running?.abort();
  }

  async prompt(params: acp.PromptRequest): Promise<acp.PromptResponse> {
    const session = this.#sessions.get(params.sessionId);
    if (!session)
      throw acp.RequestError.invalidParams({ sessionId: params.sessionId }, 'unknown session');
    session.running?.abort();
    const controller = new AbortController();
    session.running = controller;
    const text = promptText(params.prompt);
    const useMemory = this.agent.hasOwnMemory();
    const common = {
      abortSignal: controller.signal,
      ...(useMemory ? { memory: { thread: session.threadId, resource: session.resourceId } } : {}),
    };
    try {
      const messages: string | Turn[] = useMemory
        ? text
        : [...session.history, { role: 'user', content: text }];
      let stream: MastraStream = await this.agent.stream(messages, common);
      let reply = '';
      let finishReason: string | undefined;
      for (let round = 0; ; round++) {
        const outcome = await this.#forward(params.sessionId, stream, controller.signal);
        reply += outcome.text;
        finishReason = outcome.finishReason ?? finishReason;
        if (controller.signal.aborted) return { stopReason: 'cancelled' };
        if (!outcome.approval) break;
        if (round >= (this.options.maxApprovals ?? 32)) {
          throw acp.RequestError.internalError(undefined, 'too many tool approvals in one prompt');
        }
        const decision = await this.#askPermission(
          params.sessionId,
          outcome.approval,
          controller.signal,
        );
        if (decision === 'cancelled' || controller.signal.aborted)
          return { stopReason: 'cancelled' };
        const resume = { ...common, runId: outcome.runId, toolCallId: outcome.approval.toolCallId };
        if (decision === 'allow') {
          stream = await this.agent.approveToolCall(resume);
        } else {
          await this.#update(params.sessionId, {
            sessionUpdate: 'tool_call_update',
            toolCallId: outcome.approval.toolCallId,
            status: 'failed',
            content: [
              { type: 'content', content: { type: 'text', text: 'Declined by the person.' } },
            ],
          });
          stream = await this.agent.declineToolCall({
            ...resume,
            reason: 'Declined by the person.',
          });
        }
      }
      if (!useMemory) {
        session.history.push(
          { role: 'user', content: text },
          { role: 'assistant', content: reply },
        );
      }
      return { stopReason: finishReason === 'length' ? 'max_tokens' : 'end_turn' };
    } catch (error) {
      if (controller.signal.aborted) return { stopReason: 'cancelled' };
      throw error;
    } finally {
      if (session.running === controller) session.running = null;
    }
  }

  async #update(sessionId: string, update: acp.SessionUpdate): Promise<void> {
    await this.connection.sessionUpdate({ sessionId, update });
  }

  #kind(toolName: string): acp.ToolKind {
    return this.options.toolKind?.(toolName) ?? 'other';
  }

  /** Forward one Mastra stream as ACP updates; report a pending approval, if any. */
  async #forward(
    sessionId: string,
    stream: MastraStream,
    signal: AbortSignal,
  ): Promise<{ text: string; finishReason?: string; approval?: PendingApproval; runId: string }> {
    let text = '';
    let finishReason: string | undefined;
    let approval: PendingApproval | undefined;
    const announced = new Set<string>();
    for await (const chunk of stream.fullStream) {
      if (signal.aborted) break;
      switch (chunk.type) {
        case 'text-delta':
          text += chunk.payload.text;
          await this.#update(sessionId, {
            sessionUpdate: 'agent_message_chunk',
            content: { type: 'text', text: chunk.payload.text },
          });
          break;
        case 'reasoning-delta':
          await this.#update(sessionId, {
            sessionUpdate: 'agent_thought_chunk',
            content: { type: 'text', text: chunk.payload.text },
          });
          break;
        case 'tool-call': {
          const { toolCallId, toolName } = chunk.payload;
          announced.add(toolCallId);
          await this.#update(sessionId, {
            sessionUpdate: 'tool_call',
            toolCallId,
            title: chunk.payload.title ?? toolName,
            kind: this.#kind(toolName),
            status: 'in_progress',
            rawInput: stripMetadata(chunk.payload.args) as Record<string, unknown>,
          });
          break;
        }
        case 'tool-call-approval': {
          const { toolCallId, toolName, args } = chunk.payload;
          approval = { toolCallId, toolName, args: stripMetadata(args) };
          if (!announced.has(toolCallId)) {
            announced.add(toolCallId);
            await this.#update(sessionId, {
              sessionUpdate: 'tool_call',
              toolCallId,
              title: toolName,
              kind: this.#kind(toolName),
              status: 'pending',
              rawInput: approval.args as Record<string, unknown>,
            });
          } else {
            await this.#update(sessionId, {
              sessionUpdate: 'tool_call_update',
              toolCallId,
              status: 'pending',
            });
          }
          break;
        }
        case 'tool-result':
          await this.#update(sessionId, {
            sessionUpdate: 'tool_call_update',
            toolCallId: chunk.payload.toolCallId,
            status: chunk.payload.isError ? 'failed' : 'completed',
            rawOutput: chunk.payload.result as Record<string, unknown>,
            content: [
              { type: 'content', content: { type: 'text', text: stringify(chunk.payload.result) } },
            ],
          });
          break;
        case 'tool-error':
          await this.#update(sessionId, {
            sessionUpdate: 'tool_call_update',
            toolCallId: chunk.payload.toolCallId,
            status: 'failed',
            content: [
              { type: 'content', content: { type: 'text', text: stringify(chunk.payload.error) } },
            ],
          });
          break;
        case 'finish':
          finishReason = chunk.payload.stepResult?.reason ?? finishReason;
          break;
        default:
          break;
      }
    }
    return { text, finishReason, approval, runId: stream.runId };
  }

  async #askPermission(
    sessionId: string,
    approval: PendingApproval,
    signal: AbortSignal,
  ): Promise<'allow' | 'reject' | 'cancelled'> {
    const answer = this.connection.requestPermission({
      sessionId,
      toolCall: {
        toolCallId: approval.toolCallId,
        title: approval.toolName,
        kind: this.#kind(approval.toolName),
        status: 'pending',
        rawInput: approval.args as Record<string, unknown>,
      },
      options: [
        { optionId: ALLOW_ONCE, name: 'Allow', kind: 'allow_once' },
        { optionId: REJECT_ONCE, name: 'Decline', kind: 'reject_once' },
      ],
    });
    const aborted = new Promise<'cancelled'>((resolve) => {
      if (signal.aborted) resolve('cancelled');
      signal.addEventListener('abort', () => resolve('cancelled'), { once: true });
    });
    const response = await Promise.race([answer, aborted]);
    if (response === 'cancelled' || response.outcome.outcome === 'cancelled') return 'cancelled';
    return response.outcome.optionId === ALLOW_ONCE ? 'allow' : 'reject';
  }
}

/** Connect a Mastra agent to an ACP stream (any transport). */
export function connectAcp(agent: Agent, stream: acp.Stream, options: MastraAcpOptions = {}) {
  return new acp.AgentSideConnection((conn) => new MastraAcpAgent(agent, conn, options), stream);
}

/**
 * Serve a Mastra agent over ACP on stdio (the process an ACP client starts). Resolves
 * when the client closes the connection.
 */
export async function serveAcp(agent: Agent, options: ServeAcpOptions = {}): Promise<void> {
  const stdin = options.stdin ?? process.stdin;
  const stdout = options.stdout ?? process.stdout;
  const stream = acp.ndJsonStream(
    Writable.toWeb(stdout) as WritableStream<Uint8Array>,
    Readable.toWeb(stdin) as ReadableStream<Uint8Array>,
  );
  const connection = connectAcp(agent, stream, options);
  await connection.closed;
}
