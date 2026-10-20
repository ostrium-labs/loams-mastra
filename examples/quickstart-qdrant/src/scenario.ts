// The quickstart's scenario, shared by the demo and the end-to-end test: tell the agent a
// fact in one thread, then ask for it in a new thread of the same user. Semantic recall
// finds the first thread's message through Loams and puts it in the second prompt.
import { randomUUID } from 'node:crypto';
import type { Agent } from '@mastra/core/agent';
import type { Memory } from '@mastra/memory';

export interface ScenarioResult {
  resource: string;
  factMessageId: string;
  recalledIds: string[];
  answer: string;
}

export async function remembersAcrossThreads(
  agent: Agent,
  memory: Memory,
): Promise<ScenarioResult> {
  const resource = `user-${randomUUID()}`;
  const threadA = randomUUID();
  const threadB = randomUUID();
  const fact = 'My favourite colour is teal, like the sea at Kovalam.';
  const question = 'What is my favourite colour?';

  await agent.generate(fact, { memory: { thread: threadA, resource } });

  const inA = await memory.recall({ threadId: threadA, resourceId: resource });
  const factMessage = inA.messages.find(
    (m) => m.role === 'user' && JSON.stringify(m.content).includes('teal'),
  );
  if (!factMessage) throw new Error('the fact was not saved in thread A');

  const recalled = await memory.recall({
    threadId: threadB,
    resourceId: resource,
    vectorSearchString: question,
  });
  const answer = await agent.generate(question, { memory: { thread: threadB, resource } });

  return {
    resource,
    factMessageId: factMessage.id,
    recalledIds: recalled.messages.map((m) => m.id),
    answer: answer.text,
  };
}
