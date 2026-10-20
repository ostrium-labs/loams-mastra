// Vendored from mastra-ai/mastra@6a465f9d1da730e179c44bfb4ef3e6ec398ba81f:stores/_test-utils/src/domains/observability-vnext/data.ts (Apache-2.0). Changes: none.
import { EntityType, SpanType } from '@mastra/core/observability';
import type { CreateSpanRecord } from '@mastra/core/storage';

/**
 * Default base date used across observability-vnext tests so timestamps are stable.
 */
export const VNEXT_BASE_DATE = new Date('2026-01-02T12:00:00.000Z');

/**
 * Build a CreateSpanRecord with sensible defaults. Tests pass overrides for the
 * fields they care about.
 */
export function makeSpan(
  overrides: Partial<CreateSpanRecord> & Pick<CreateSpanRecord, 'traceId' | 'spanId'>,
): CreateSpanRecord {
  const startedAt = overrides.startedAt ?? VNEXT_BASE_DATE;
  const endedAt = 'endedAt' in overrides ? overrides.endedAt : new Date(startedAt.getTime() + 1000);
  return {
    parentSpanId: null,
    name: overrides.name ?? overrides.spanId,
    spanType: overrides.spanType ?? SpanType.AGENT_RUN,
    isEvent: false,
    startedAt,
    endedAt,
    ...overrides,
  } as CreateSpanRecord;
}

export { EntityType, SpanType };
