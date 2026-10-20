// Vendored from mastra-ai/mastra@6a465f9d1da730e179c44bfb4ef3e6ec398ba81f:workflows/_test-utils/src/index.test.ts (Apache-2.0). Changes: none.
/**
 * Test the DurableAgent test suite with EventEmitterPubSub
 *
 * This serves as both:
 * 1. A verification that the test suite works correctly
 * 2. An example of how to use the factory
 */

import { EventEmitterPubSub } from '@mastra/core/events';
import { createDurableAgentTestSuite } from './factory';

// Run the full test suite with EventEmitterPubSub
createDurableAgentTestSuite({
  name: 'DurableAgent (EventEmitter)',
  createPubSub: () => new EventEmitterPubSub(),
  // Skip model fallback runtime tests - they have timing issues in shared suite (pass in core)
  skip: {
    modelFallbackRuntime: true,
  },
});
