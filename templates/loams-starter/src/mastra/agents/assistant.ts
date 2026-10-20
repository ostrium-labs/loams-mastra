// An agent with memory on Loams Postgres (recent messages plus semantic recall across a
// user's threads) and a RAG tool over the stored documents.
import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { embedder, model, storage, vector } from '../storage.js';
import { searchDocsTool } from '../tools/search-docs.js';

export function createAssistant(agentModel: unknown = model) {
  return new Agent({
    id: 'assistant',
    name: 'Assistant',
    instructions:
      'You are a helpful assistant. Use search-docs to answer from the stored documents, and use what you remember about the user.',
    model: agentModel as never,
    tools: { searchDocsTool },
    memory: new Memory({
      storage,
      vector,
      embedder: embedder as never,
      options: {
        lastMessages: 10,
        semanticRecall: { topK: 3, messageRange: 1, scope: 'resource' },
      },
    }),
  });
}
