import { describe, expect, it } from 'vitest';
import { findUnpinned, isPinnedScope } from './check-pins.mjs';

describe('check-pins', () => {
  it('accepts exact versions, including prereleases', () => {
    expect(
      findUnpinned({
        dependencies: { '@mastra/core': '1.78.0', '@mastra/pg': '1.32.0-alpha.3' },
        devDependencies: { mastra: '1.34.2' },
      }),
    ).toEqual([]);
  });

  it('rejects ranges, tags and protocols', () => {
    const out = findUnpinned({
      dependencies: { '@mastra/core': '^1.78.0', '@mastra/qdrant': 'latest' },
      devDependencies: { '@mastra/memory': '~1.38.0', mastra: '>=1.0.0' },
      optionalDependencies: { '@mastra/rag': 'workspace:*' },
    });
    expect(out).toHaveLength(5);
  });

  it('ignores peer ranges and other scopes', () => {
    expect(
      findUnpinned({
        peerDependencies: { '@mastra/core': '>=1.76.0-0 <2.0.0-0' },
        dependencies: { zod: '^4.0.0', 'mastra-community-thing': '^1.0.0' },
      }),
    ).toEqual([]);
    expect(isPinnedScope('mastra-community-thing')).toBe(false);
  });
});
