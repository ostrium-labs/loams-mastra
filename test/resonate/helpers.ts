export const RESONATE_URL = process.env.RESONATE_URL ?? 'http://127.0.0.1:8001';
export const RESONATE_BACKEND = process.env.RESONATE_BACKEND ?? 'upstream';
export const hasServer = Boolean(process.env.RESONATE_URL);

export function uniqueId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
