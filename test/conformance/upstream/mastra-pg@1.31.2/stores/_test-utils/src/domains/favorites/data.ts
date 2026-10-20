// Vendored from mastra-ai/mastra@6a465f9d1da730e179c44bfb4ef3e6ec398ba81f:stores/_test-utils/src/domains/favorites/data.ts (Apache-2.0). Changes: none.
import type { StorageCreateAgentInput, StorageCreateSkillInput } from '@mastra/core/storage';
import { randomUUID } from 'node:crypto';

export const createSampleAgent = ({
  id = `agent-${randomUUID()}`,
  authorId = 'owner',
  visibility = 'public',
  name = 'Test Agent',
  instructions = 'You are a helpful assistant',
  model = { provider: 'openai', name: 'gpt-4' },
}: Partial<StorageCreateAgentInput> = {}): StorageCreateAgentInput => ({
  id,
  authorId,
  visibility,
  name,
  instructions,
  model,
});

export const createSampleSkill = ({
  id = `skill-${randomUUID()}`,
  authorId = 'owner',
  visibility = 'public',
  name = 'Test Skill',
  description = 'A skill for tests',
  instructions = 'Do the thing',
}: Partial<StorageCreateSkillInput> = {}): StorageCreateSkillInput => ({
  id,
  authorId,
  visibility,
  name,
  description,
  instructions,
});
