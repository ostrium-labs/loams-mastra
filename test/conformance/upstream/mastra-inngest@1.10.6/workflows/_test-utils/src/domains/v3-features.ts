// Vendored from mastra-ai/mastra@6a465f9d1da730e179c44bfb4ef3e6ec398ba81f:workflows/_test-utils/src/domains/v3-features.ts (Apache-2.0). Changes: none.
/**
 * V3 model features tests for DurableAgent
 *
 * Tests that DurableAgent can handle V3 models (AI SDK v6)
 * with proper serialization of model config.
 */

import { describe, it, expect } from 'vitest';
import type { DurableAgentTestContext } from '../types';
import { createTextStreamModel } from '../mock-models';

export function createV3FeaturesTests(context: DurableAgentTestContext) {
  const { createAgent } = context;

  describe('V3 model features', () => {
    it('should serialize model config with version info', async () => {
      const mockModel = createTextStreamModel('Hello from V2');

      const agent = await createAgent({
        id: 'v3-config-agent',
        instructions: 'Test V3 config',
        model: mockModel,
      });

      const result = await agent.prepare('Hello');

      // Model config should be serialized with version info
      expect(result.workflowInput.modelConfig).toBeDefined();
      expect(result.workflowInput.modelConfig.modelId).toBeDefined();
      expect(result.workflowInput.modelConfig.provider).toBeDefined();
    });

    it('should complete stream with model', async () => {
      const mockModel = createTextStreamModel('V3 response');

      const agent = await createAgent({
        id: 'v3-stream-agent',
        instructions: 'Test V3 streaming',
        model: mockModel,
      });

      const { runId, cleanup } = await agent.stream('Hello V3');

      expect(runId).toBeDefined();

      cleanup();
    });
  });
}
