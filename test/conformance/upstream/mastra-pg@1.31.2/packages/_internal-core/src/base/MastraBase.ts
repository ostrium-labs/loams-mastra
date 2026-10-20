// Vendored from mastra-ai/mastra@6a465f9d1da730e179c44bfb4ef3e6ec398ba81f:packages/_internal-core/src/base/MastraBase.ts (Apache-2.0). Changes: none.
import type { IMastraLogger } from '../logger';
import { ConsoleLogger, RegisteredLogger } from '../logger';

export class MastraBase {
  component: RegisteredLogger = RegisteredLogger.LLM;
  protected logger: IMastraLogger;
  name?: string;
  #rawConfig?: Record<string, unknown>;

  constructor({
    component,
    name,
    rawConfig,
  }: {
    component?: RegisteredLogger;
    name?: string;
    rawConfig?: Record<string, unknown>;
  }) {
    this.component = component || RegisteredLogger.LLM;
    this.name = name;
    this.#rawConfig = rawConfig;
    this.logger = new ConsoleLogger({ name: `${this.component} - ${this.name}` });
  }

  /**
   * Returns the raw storage configuration this primitive was created from,
   * or undefined if it was created from code.
   */
  toRawConfig(): Record<string, unknown> | undefined {
    return this.#rawConfig;
  }

  /**
   * Sets the raw storage configuration for this primitive.
   * @internal
   */
  __setRawConfig(rawConfig: Record<string, unknown>): void {
    this.#rawConfig = rawConfig;
  }

  /**
   * Set the logger for the agent
   * @param logger
   */
  __setLogger(logger: IMastraLogger) {
    this.logger =
      'child' in logger && typeof (logger as any).child === 'function'
        ? (logger as any).child({ component: this.component })
        : logger;
  }
}
