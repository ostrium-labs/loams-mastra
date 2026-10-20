// Loams Postgres checks for @mastra/pg (design §66 §5.3, V1 to V6). They run after the
// vendored pg suite, against the same Loams Postgres (POSTGRES_* from the harness), and record
// what they find in results/checks/postgres.json. V7 (a suspended compute wakes on connect)
// runs nightly.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ObservabilityStoragePostgresVNext, PgVector, PostgresStore } from '@mastra/pg';
import pg from 'pg';
import { afterAll, describe, expect, it } from 'vitest';

const env = (k: string, d: string) => process.env[k] ?? d;
const admin = {
  host: env('POSTGRES_HOST', '127.0.0.1'),
  port: Number(env('POSTGRES_PORT', '55433')),
  user: env('POSTGRES_USER', 'cloud_admin'),
  password: env('POSTGRES_PASSWORD', 'cloud_admin'),
  database: env('POSTGRES_DB', 'postgres'),
};
const url = (c: typeof admin) =>
  `postgresql://${encodeURIComponent(c.user)}:${encodeURIComponent(c.password)}@${c.host}:${c.port}/${c.database}`;

const findings: Record<string, unknown> = {};
const suffix = Date.now().toString(36);

async function withClient<T>(c: typeof admin, f: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client(c);
  await client.connect();
  try {
    return await f(client);
  } finally {
    await client.end();
  }
}

// An application role like pg-control's: LOGIN, no superuser, owns its own database.
const appRole = `mastra_app_${suffix}`;
const app = { ...admin, user: appRole, password: `pw_${suffix}`, database: `mastra_app_${suffix}` };

afterAll(async () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const out = join(here, '..', 'results', 'checks');
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'postgres.json'), `${JSON.stringify(findings, null, 2)}\n`);
  await withClient(admin, async (c) => {
    await c.query(`DROP DATABASE IF EXISTS ${app.database} WITH (FORCE)`);
    await c.query(`DROP ROLE IF EXISTS ${appRole}`);
  });
});

describe('Loams Postgres for @mastra/pg', () => {
  it('v1_pgvector_at_least_0_7', async () => {
    const version = await withClient(admin, async (c) => {
      const r = await c.query(
        "SELECT default_version FROM pg_available_extensions WHERE name = 'vector'",
      );
      return r.rows[0]?.default_version as string | undefined;
    });
    findings.pgvector = version ?? null;
    findings.server = await withClient(
      admin,
      async (c) => (await c.query('SHOW server_version')).rows[0].server_version,
    );
    expect(version).toBeDefined();
    const [major = 0, minor = 0] = (version ?? '0.0').split('.').map(Number);
    expect(major > 0 || minor >= 7).toBe(true);
  });

  it('v2_create_extension_as_app_role', async () => {
    await withClient(admin, async (c) => {
      await c.query(
        `CREATE ROLE ${appRole} LOGIN PASSWORD '${app.password}' NOSUPERUSER NOCREATEROLE`,
      );
      await c.query(`CREATE DATABASE ${app.database} OWNER ${appRole}`);
    });
    const vector = new PgVector({ id: 'v2-app-role', connectionString: url(app) });
    try {
      await vector.createIndex({ indexName: 'v2_check', dimension: 3 });
      await vector.upsert({ indexName: 'v2_check', vectors: [[1, 0, 0]], ids: ['a'] });
      const hits = await vector.query({ indexName: 'v2_check', queryVector: [1, 0, 0], topK: 1 });
      expect(hits[0]?.id).toBe('a');
      const halfvec = await withClient(
        app,
        async (c) => (await c.query("SELECT '[1,2,3]'::halfvec(3)::text AS v")).rows[0].v,
      );
      expect(halfvec).toBe('[1,2,3]');
    } finally {
      await vector.disconnect();
    }
  });

  it('v3_advisory_xact_lock_and_skip_locked', async () => {
    const a = new pg.Client(admin);
    const b = new pg.Client(admin);
    await Promise.all([a.connect(), b.connect()]);
    const table = `v3_jobs_${suffix}`;
    try {
      await a.query(`CREATE TABLE ${table} (id int PRIMARY KEY)`);
      await a.query(`INSERT INTO ${table} VALUES (1), (2)`);

      await a.query('BEGIN');
      await a.query('SELECT pg_advisory_xact_lock(4242)');
      const tryB = await b.query('SELECT pg_try_advisory_xact_lock(4242) AS got');
      expect(tryB.rows[0].got).toBe(false);
      const locked = await a.query(
        `SELECT id FROM ${table} ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED`,
      );
      expect(locked.rows[0].id).toBe(1);

      await b.query('BEGIN');
      const skipped = await b.query(
        `SELECT id FROM ${table} ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED`,
      );
      expect(skipped.rows[0].id).toBe(2);
      await b.query('COMMIT');
      await a.query('COMMIT');

      const after = await b.query('SELECT pg_try_advisory_xact_lock(4242) AS got');
      expect(after.rows[0].got).toBe(true);
    } finally {
      await a.query(`DROP TABLE IF EXISTS ${table}`).catch(() => {});
      await Promise.all([a.end(), b.end()]);
    }
  });

  it('v4_partition_mode_recorded', async () => {
    const schemaName = `v4_obs_${suffix}`;
    const obs = new ObservabilityStoragePostgresVNext({
      connectionString: url(admin),
      schemaName,
    } as never);
    try {
      await obs.init();
      findings.partitionMode = obs.partitionMode ?? null;
      expect(['native', 'partman', 'timescale']).toContain(obs.partitionMode);
    } finally {
      await withClient(admin, (c) => c.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`));
    }
  });

  it('v5_disable_init_then_init', async () => {
    // The pattern Mastra documents for a runtime role without DDL: init() once with a
    // deployment-time store, then disableInit: true at runtime.
    const schemaName = `v5_${suffix}`;
    const runtime = new PostgresStore({
      id: 'v5-runtime',
      connectionString: url(admin),
      schemaName,
      disableInit: true,
    });
    const deploy = new PostgresStore({ id: 'v5-deploy', connectionString: url(admin), schemaName });
    try {
      const count = () =>
        withClient(
          admin,
          async (c) =>
            (
              await c.query(
                'SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = $1',
                [schemaName],
              )
            ).rows[0].n,
        );
      await runtime.getStore('memory');
      expect(await count()).toBe(0); // disableInit created nothing
      await deploy.init();
      expect(await count()).toBeGreaterThan(0);
      const memory = await runtime.getStore('memory');
      const thread = await memory?.saveThread({
        thread: {
          id: `t-${suffix}`,
          resourceId: 'r',
          title: 'v5',
          createdAt: new Date(),
          updatedAt: new Date(),
          metadata: {},
        },
      });
      expect(thread?.id).toBe(`t-${suffix}`);
    } finally {
      await Promise.all([runtime.close(), deploy.close()]);
      await withClient(admin, (c) => c.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`));
    }
  });

  it('v6_split_pools', async () => {
    const writePool = new pg.Pool({ connectionString: url(admin), max: 2 });
    const readPool = new pg.Pool({ connectionString: url(admin), max: 2 });
    const schemaName = `v6_${suffix}`;
    const store = new PostgresStore({ id: 'v6-split', writePool, readPool, schemaName });
    try {
      await store.init();
      const memory = await store.getStore('memory');
      await memory?.saveThread({
        thread: {
          id: `t-${suffix}`,
          resourceId: 'r',
          title: 'v6',
          createdAt: new Date(),
          updatedAt: new Date(),
          metadata: {},
        },
      });
      const read = await memory?.getThreadById({ threadId: `t-${suffix}` });
      expect(read?.title).toBe('v6');
    } finally {
      await store.close();
      await Promise.all([writePool.end(), readPool.end()]);
      await withClient(admin, (c) => c.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`));
    }
  });
});
