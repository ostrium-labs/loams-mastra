// Vendored from mastra-ai/mastra@81299c921d6f499d4c62f14c38e4d4d88b4fbfae:stores/_test-utils/src/domains/datasets/data.ts (Apache-2.0). Changes: none.
import { randomUUID } from 'node:crypto';
import type { CreateDatasetInput, AddDatasetItemInput } from '@mastra/core/storage';

/**
 * Creates sample dataset input for tests.
 * Returns a CreateDatasetInput — no DB calls.
 */
export function createSampleDataset(overrides?: Partial<CreateDatasetInput>): CreateDatasetInput {
  return {
    name: `dataset-${randomUUID().slice(0, 8)}`,
    ...overrides,
  };
}

/**
 * Creates sample dataset item input for tests.
 * Caller must supply datasetId separately (mirrors AddDatasetItemInput).
 */
export function createSampleDatasetItem(
  overrides?: Partial<Omit<AddDatasetItemInput, 'datasetId'>>,
): Omit<AddDatasetItemInput, 'datasetId'> {
  return {
    input: { q: `question-${randomUUID().slice(0, 8)}` },
    ...overrides,
  };
}
