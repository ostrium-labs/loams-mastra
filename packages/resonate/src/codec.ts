/** JSON-safe encoding of step results and errors stored in durable promises. */
export class CodecError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CodecError';
  }
}

export function encodeValue(_value: unknown): unknown {
  // TODO(Task 15): encode values and errors (name, message, stack, cause chain);
  // refuse functions, symbols, bigints and cycles with a CodecError.
  throw new Error('TODO(Task 15)');
}

export function decodeValue<T = unknown>(_value: unknown): T {
  // TODO(Task 15)
  throw new Error('TODO(Task 15)');
}
