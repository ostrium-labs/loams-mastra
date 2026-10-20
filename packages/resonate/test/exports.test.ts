import { DefaultExecutionEngine, Run, Workflow } from '@mastra/core/workflows';
import type { Resonate } from '@resonatehq/sdk/async';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { init, ResonateExecutionEngine, ResonateRun, ResonateWorkflow } from '../src/index';

describe('package skeleton', () => {
  it('exports_init_and_engine', () => {
    expectTypeOf(init).parameter(0).toEqualTypeOf<Resonate>();
    expectTypeOf<ReturnType<typeof init>>().toHaveProperty('createWorkflow');
    expectTypeOf<ReturnType<typeof init>>().toHaveProperty('createStep');
    expect(Object.getPrototypeOf(ResonateExecutionEngine)).toBe(DefaultExecutionEngine);
    expect(Object.getPrototypeOf(ResonateWorkflow)).toBe(Workflow);
    expect(Object.getPrototypeOf(ResonateRun)).toBe(Run);
  });
});
