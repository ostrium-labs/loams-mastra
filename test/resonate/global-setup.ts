import { execFileSync } from 'node:child_process';

/** The worker fixtures run in separate processes and import the built package. */
export default function setup() {
  if (!process.env.RESONATE_URL) return;
  execFileSync('pnpm', ['--filter', '@loams/mastra-resonate', 'build'], { stdio: 'inherit' });
}
