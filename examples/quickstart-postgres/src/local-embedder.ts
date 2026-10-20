// A deterministic, offline embedder for the demo and the tests: a bag of hashed word
// stems, L2-normalised. Messages that share words land close together, which is all
// semantic recall needs to be shown working without a model provider. Use a real
// embedding model in an application.

export const LOCAL_DIMENSIONS = 256;

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function embedText(text: string): number[] {
  const v = new Array<number>(LOCAL_DIMENSIONS).fill(0);
  for (const word of text.toLowerCase().match(/[a-z0-9]+/g) ?? []) {
    if (word.length < 3) continue;
    const stem = word.slice(0, 6); // "colour" and "colours" agree
    const i = hash(stem) % LOCAL_DIMENSIONS;
    v[i] = (v[i] ?? 0) + 1;
  }
  const norm = Math.hypot(...v) || 1;
  return v.map((x) => x / norm);
}

/** An AI SDK v2 embedding model, which Mastra's Memory accepts as `embedder`. */
export const localEmbedder = {
  specificationVersion: 'v2' as const,
  provider: 'local',
  modelId: 'hashed-bag-of-words-256',
  maxEmbeddingsPerCall: 256,
  supportsParallelCalls: true,
  async doEmbed({ values }: { values: string[] }) {
    return { embeddings: values.map(embedText) };
  },
};
