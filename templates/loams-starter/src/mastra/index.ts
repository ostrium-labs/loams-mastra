import { Mastra } from '@mastra/core/mastra';
import { createAssistant } from './agents/assistant.js';
import { storage, vector } from './storage.js';
import { ingestDocsWorkflow } from './workflows/ingest-docs.js';

export const mastra = new Mastra({
  storage,
  vectors: { loams: vector },
  agents: { assistant: createAssistant() },
  workflows: { ingestDocsWorkflow },
});
