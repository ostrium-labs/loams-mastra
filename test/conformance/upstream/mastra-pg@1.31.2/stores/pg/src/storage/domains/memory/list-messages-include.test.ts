// Vendored from mastra-ai/mastra@6a465f9d1da730e179c44bfb4ef3e6ec398ba81f:stores/pg/src/storage/domains/memory/list-messages-include.test.ts (Apache-2.0). Changes: none.
import { createMessagesListIncludeResourceScopeTest } from '@internal/storage-test-utils';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, vi } from 'vitest';

import { connectionString } from '../../test-utils';
import { MemoryPG } from './index';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const SCHEMA_NAME = 'list_messages_include';

describe('MemoryPG', () => {
  let pool: Pool;
  let store: MemoryPG;

  beforeAll(async () => {
    pool = new Pool({ connectionString });
    store = new MemoryPG({ pool, schemaName: SCHEMA_NAME });
    await store.init();
  });

  afterAll(async () => {
    await pool.end();
  });

  createMessagesListIncludeResourceScopeTest({ getMemoryStorage: () => store });
});
