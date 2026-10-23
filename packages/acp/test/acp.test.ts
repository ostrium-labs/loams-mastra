// FT0 Task 2's tests (plan FT1): a Mastra agent served over ACP, driven by the SDK's own
// client side in-process, with mock models (no network, no key).

import { PassThrough, Readable, Writable } from 'node:stream';
import * as acp from '@agentclientprotocol/sdk';
import { Agent } from '@mastra/core/agent';
import { Mastra } from '@mastra/core/mastra';
import { InMemoryStore } from '@mastra/core/storage';
import { MastraLanguageModelV2Mock } from '@mastra/core/test-utils/llm-mock';
import { createTool } from '@mastra/core/tools';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { ALLOW_ONCE, connectAcp, promptText, REJECT_ONCE, serveAcp } from '../src/index.js';

process.env.MASTRA_TELEMETRY_DISABLED = '1';

const usage = { inputTokens: 1, outputTokens: 1, totalTokens: 2 };

type Part = Record<string, unknown>;

function streamOf(parts: Part[], gate?: Promise<void>) {
  return {
    stream: new ReadableStream({
      async start(controller) {
        controller.enqueue({ type: 'stream-start', warnings: [] });
        for (const part of parts) {
          if (part.type === 'finish' && gate) await gate;
          controller.enqueue(part);
        }
        controller.close();
      },
    }),
  };
}

const textTurn = (text: string, gate?: Promise<void>) =>
  streamOf(
    [
      { type: 'text-start', id: 't' },
      { type: 'text-delta', id: 't', delta: text },
      { type: 'text-end', id: 't' },
      { type: 'finish', finishReason: 'stop', usage },
    ],
    gate,
  );

const toolTurn = (toolCallId: string, toolName: string, input: unknown) =>
  streamOf([
    { type: 'tool-call', toolCallId, toolName, input: JSON.stringify(input) },
    { type: 'finish', finishReason: 'tool-calls', usage },
  ]);

/** A model that answers each call with the next scripted turn. */
function scripted(...turns: (() => ReturnType<typeof streamOf>)[]) {
  let call = 0;
  return new MastraLanguageModelV2Mock({
    doStream: async () => {
      const turn = turns[Math.min(call, turns.length - 1)];
      call += 1;
      if (!turn) throw new Error('no scripted turn');
      return turn();
    },
  });
}

function registered(agent: Agent): Agent {
  const mastra = new Mastra({ agents: { agent }, storage: new InMemoryStore(), logger: false });
  return mastra.getAgent('agent');
}

interface Harness {
  client: acp.ClientSideConnection;
  updates: acp.SessionUpdate[];
  permissions: acp.RequestPermissionRequest[];
  sessionId: string;
}

async function connect(
  agent: Agent,
  answer: (
    req: acp.RequestPermissionRequest,
  ) => Promise<acp.RequestPermissionResponse> | acp.RequestPermissionResponse = () => ({
    outcome: { outcome: 'selected', optionId: ALLOW_ONCE },
  }),
): Promise<Harness> {
  const toAgent = new TransformStream<Uint8Array, Uint8Array>();
  const toClient = new TransformStream<Uint8Array, Uint8Array>();
  connectAcp(agent, acp.ndJsonStream(toClient.writable, toAgent.readable));
  const updates: acp.SessionUpdate[] = [];
  const permissions: acp.RequestPermissionRequest[] = [];
  const client = new acp.ClientSideConnection(
    () => ({
      sessionUpdate: (n) => {
        updates.push(n.update);
      },
      requestPermission: (req) => {
        permissions.push(req);
        return answer(req);
      },
    }),
    acp.ndJsonStream(toAgent.writable, toClient.readable),
  );
  await client.initialize({ protocolVersion: acp.PROTOCOL_VERSION, clientCapabilities: {} });
  const { sessionId } = await client.newSession({ cwd: '/work/comet', mcpServers: [] });
  return { client, updates, permissions, sessionId };
}

const prompt = (h: Harness, text: string) =>
  h.client.prompt({ sessionId: h.sessionId, prompt: [{ type: 'text', text }] });

const texts = (updates: acp.SessionUpdate[]) =>
  updates
    .filter((u) => u.sessionUpdate === 'agent_message_chunk')
    .map((u) =>
      u.sessionUpdate === 'agent_message_chunk' && u.content.type === 'text' ? u.content.text : '',
    )
    .join('');

function deployTool(ran: string[]) {
  return createTool({
    id: 'deploy',
    description: 'Deploy the app',
    inputSchema: z.object({ app: z.string() }),
    requireApproval: true,
    execute: async ({ app }) => {
      ran.push(app);
      return { deployed: app };
    },
  });
}

describe('@loams/mastra-acp', () => {
  it('prompt_streams_text', async () => {
    const agent = new Agent({
      id: 'bot',
      name: 'Bot',
      instructions: 'be brief',
      model: scripted(() => textTurn('Hello from Mastra.')),
    });
    const h = await connect(agent);
    const result = await prompt(h, 'hi');
    expect(result.stopReason).toBe('end_turn');
    expect(texts(h.updates)).toBe('Hello from Mastra.');
  });

  it('keeps the conversation of a session without memory', async () => {
    const model = scripted(
      () => textTurn('first'),
      () => textTurn('second'),
    );
    const agent = new Agent({ id: 'bot', name: 'Bot', instructions: 'x', model });
    const h = await connect(agent);
    await prompt(h, 'one');
    await prompt(h, 'two');
    const second = JSON.stringify(model.doStreamCalls[1]?.prompt);
    expect(second).toContain('one');
    expect(second).toContain('first');
    expect(second).toContain('two');
  });

  it('tool_call_reports_status', async () => {
    const lookup = createTool({
      id: 'lookup',
      description: 'Look a word up',
      inputSchema: z.object({ word: z.string() }),
      execute: async ({ word }) => ({ meaning: `${word} means soil` }),
    });
    const agent = registered(
      new Agent({
        id: 'agent',
        name: 'Bot',
        instructions: 'x',
        tools: { lookup },
        model: scripted(
          () => toolTurn('call-1', 'lookup', { word: 'loam' }),
          () => textTurn('Done.'),
        ),
      }),
    );
    const h = await connect(agent);
    const result = await prompt(h, 'what is loam?');
    expect(result.stopReason).toBe('end_turn');
    const call = h.updates.find((u) => u.sessionUpdate === 'tool_call');
    expect(call).toMatchObject({
      toolCallId: 'call-1',
      title: 'lookup',
      status: 'in_progress',
      rawInput: { word: 'loam' },
    });
    const done = h.updates.find((u) => u.sessionUpdate === 'tool_call_update');
    expect(done).toMatchObject({
      toolCallId: 'call-1',
      status: 'completed',
      rawOutput: { meaning: 'loam means soil' },
    });
    expect(texts(h.updates)).toBe('Done.');
  });

  it('approval_maps_to_request_permission', async () => {
    const ran: string[] = [];
    const agent = registered(
      new Agent({
        id: 'agent',
        name: 'Bot',
        instructions: 'x',
        tools: { deploy: deployTool(ran) },
        model: scripted(
          () => toolTurn('call-d', 'deploy', { app: 'signup' }),
          () => textTurn('Deployed.'),
        ),
      }),
    );
    const h = await connect(agent);
    const result = await prompt(h, 'deploy signup');
    expect(result.stopReason).toBe('end_turn');
    expect(h.permissions).toHaveLength(1);
    expect(h.permissions[0]).toMatchObject({
      sessionId: h.sessionId,
      toolCall: { toolCallId: 'call-d', title: 'deploy', rawInput: { app: 'signup' } },
    });
    expect(h.permissions[0]?.options.map((o) => o.optionId)).toEqual([ALLOW_ONCE, REJECT_ONCE]);
    expect(ran).toEqual(['signup']);
    expect(texts(h.updates)).toBe('Deployed.');
  });

  it('decline_stops_tool', async () => {
    const ran: string[] = [];
    const agent = registered(
      new Agent({
        id: 'agent',
        name: 'Bot',
        instructions: 'x',
        tools: { deploy: deployTool(ran) },
        model: scripted(
          () => toolTurn('call-d', 'deploy', { app: 'signup' }),
          () => textTurn('Not deployed.'),
        ),
      }),
    );
    const h = await connect(agent, () => ({
      outcome: { outcome: 'selected', optionId: REJECT_ONCE },
    }));
    const result = await prompt(h, 'deploy signup');
    expect(result.stopReason).toBe('end_turn');
    expect(ran).toEqual([]);
    expect(h.updates).toContainEqual(
      expect.objectContaining({
        sessionUpdate: 'tool_call_update',
        toolCallId: 'call-d',
        status: 'failed',
      }),
    );
  });

  it('cancel_aborts_stream', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const agent = new Agent({
      id: 'bot',
      name: 'Bot',
      instructions: 'x',
      model: scripted(() => textTurn('slow', gate)),
    });
    const h = await connect(agent);
    const running = prompt(h, 'take your time');
    await new Promise((resolve) => setTimeout(resolve, 50));
    await h.client.cancel({ sessionId: h.sessionId });
    const result = await running;
    release();
    expect(result.stopReason).toBe('cancelled');
  });

  it('cancel while a permission is pending ends the prompt cancelled', async () => {
    const ran: string[] = [];
    const agent = registered(
      new Agent({
        id: 'agent',
        name: 'Bot',
        instructions: 'x',
        tools: { deploy: deployTool(ran) },
        model: scripted(() => toolTurn('call-d', 'deploy', { app: 'signup' })),
      }),
    );
    let harness: Harness | undefined;
    const h = await connect(agent, async () => {
      await harness?.client.cancel({ sessionId: harness.sessionId });
      return new Promise<acp.RequestPermissionResponse>(() => {});
    });
    harness = h;
    const result = await prompt(h, 'deploy signup');
    expect(result.stopReason).toBe('cancelled');
    expect(ran).toEqual([]);
  });

  it('a failed model call fails the prompt', async () => {
    const model = new MastraLanguageModelV2Mock({
      doStream: async () => {
        throw new Error('provider is down');
      },
    });
    const agent = new Agent({ id: 'bot', name: 'Bot', instructions: 'x', model });
    const h = await connect(agent);
    await expect(prompt(h, 'hi')).rejects.toThrow();
  });

  it('an unknown session is an error', async () => {
    const agent = new Agent({
      id: 'bot',
      name: 'Bot',
      instructions: 'x',
      model: scripted(() => textTurn('x')),
    });
    const h = await connect(agent);
    await expect(
      h.client.prompt({ sessionId: 'nope', prompt: [{ type: 'text', text: 'hi' }] }),
    ).rejects.toThrow();
  });
});

describe('serveAcp', () => {
  it('serves on byte streams and returns when the client closes', async () => {
    const agent = new Agent({
      id: 'bot',
      name: 'Bot',
      instructions: 'x',
      model: scripted(() => textTurn('over stdio')),
    });
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const served = serveAcp(agent, { stdin, stdout });
    const updates: acp.SessionUpdate[] = [];
    const client = new acp.ClientSideConnection(
      () => ({
        sessionUpdate: (n) => {
          updates.push(n.update);
        },
        requestPermission: () => ({ outcome: { outcome: 'cancelled' } }),
      }),
      acp.ndJsonStream(
        Writable.toWeb(stdin) as WritableStream<Uint8Array>,
        Readable.toWeb(stdout) as ReadableStream<Uint8Array>,
      ),
    );
    const init = await client.initialize({
      protocolVersion: acp.PROTOCOL_VERSION,
      clientCapabilities: {},
    });
    expect(init.protocolVersion).toBe(acp.PROTOCOL_VERSION);
    const { sessionId } = await client.newSession({ cwd: '/w', mcpServers: [] });
    await client.prompt({ sessionId, prompt: [{ type: 'text', text: 'hi' }] });
    expect(texts(updates)).toBe('over stdio');
    stdin.end();
    await served;
  });
});

describe('promptText', () => {
  it('joins text and references', () => {
    expect(
      promptText([
        { type: 'text', text: 'fix this' },
        { type: 'resource_link', name: 'app.ts', uri: 'file:///w/app.ts' },
        { type: 'resource', resource: { uri: 'file:///w/a.md', text: 'body' } },
      ]),
    ).toBe(
      'fix this\n[app.ts](file:///w/app.ts)\n<resource uri="file:///w/a.md">\nbody\n</resource>',
    );
  });
});
