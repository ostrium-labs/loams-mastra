// Vendored from mastra-ai/mastra@6a465f9d1da730e179c44bfb4ef3e6ec398ba81f:stores/pg/src/storage/db/sanitize-json.ts (Apache-2.0). Changes: none.
const repair = (value: string): string =>
  value
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '\uFFFD')
    .replaceAll('\0', '');

function repairJson(value: unknown): unknown {
  if (typeof value === 'string') return repair(value);
  if (Array.isArray(value)) return value.map(repairJson);
  if (value && typeof value === 'object') {
    const repaired: Record<string, unknown> = Object.create(null);
    for (const [key, entry] of Object.entries(value)) {
      const repairedKey = repair(key);
      if (Object.hasOwn(repaired, repairedKey)) {
        throw new Error(`JSON keys collide after PostgreSQL normalization: ${repairedKey}`);
      }
      repaired[repairedKey] = repairJson(entry);
    }
    return repaired;
  }
  return value;
}

/** Repair text for a PostgreSQL `text` column, which rejects NUL characters. */
export function toPgText(value: string): string {
  return repair(value);
}

/** Serialize JSON values without emitting Unicode sequences PostgreSQL rejects. */
export function toPgJson(value: unknown): string {
  const json = JSON.stringify(value);
  if (json === undefined || !/\\u(?:0000|[dD][89a-fA-F][0-9a-fA-F]{2})/.test(json)) return json;
  return JSON.stringify(repairJson(JSON.parse(json)));
}
