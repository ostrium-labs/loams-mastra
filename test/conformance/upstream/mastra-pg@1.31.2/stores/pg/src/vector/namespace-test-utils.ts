// Vendored from mastra-ai/mastra@6a465f9d1da730e179c44bfb4ef3e6ec398ba81f:stores/pg/src/vector/namespace-test-utils.ts (Apache-2.0). Changes: none.
export const namespaceSchemaReadyResult = () => ({
  rows: [{ vector_id: true, namespace: true, composite_index: true, legacy_constraint: false }],
});
