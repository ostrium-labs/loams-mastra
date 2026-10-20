// Vendored from mastra-ai/mastra@6a465f9d1da730e179c44bfb4ef3e6ec398ba81f:packages/_vendored/ai_v5/src/index.ts (Apache-2.0). Changes: none.
import { generateText as generateTextV5, streamText as streamTextV5 } from 'ai';

export * from 'ai';

// Keep both security overrides after caller options so embedded system-role messages cannot be re-enabled.
export const generateText: typeof generateTextV5 = options =>
  generateTextV5({
    ...options,
    allowSystemInMessages: false,
  });

export const streamText: typeof streamTextV5 = options =>
  streamTextV5({
    ...options,
    allowSystemInMessages: false,
  });
