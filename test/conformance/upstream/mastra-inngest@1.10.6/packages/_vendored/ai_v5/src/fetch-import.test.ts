// Vendored from mastra-ai/mastra@6a465f9d1da730e179c44bfb4ef3e6ec398ba81f:packages/_vendored/ai_v5/src/fetch-import.test.ts (Apache-2.0). Changes: none.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const packageDirectory = fileURLToPath(new URL('..', import.meta.url));

describe('@ai-sdk/provider-utils initialization', () => {
  it('imports when global fetch is not callable', () => {
    expect(() =>
      execFileSync(
        process.execPath,
        ['--input-type=module', '--eval', "globalThis.fetch = undefined; await import('@ai-sdk/provider-utils');"],
        { cwd: packageDirectory, stdio: 'pipe' },
      ),
    ).not.toThrow();
  });
});
