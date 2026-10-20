import { Codec } from '@resonatehq/sdk';
import { Resonate } from '@resonatehq/sdk/async';
import { describe, expect, it } from 'vitest';
import { hasServer, RESONATE_BACKEND, RESONATE_URL, uniqueId } from './helpers';

describe.skipIf(!hasServer)(`Resonate backend (${RESONATE_BACKEND})`, () => {
  it('resonate_backend_answers', async () => {
    const resonate = new Resonate({ url: RESONATE_URL, group: uniqueId('probe') });
    try {
      const id = uniqueId('probe');
      const codec = new Codec();
      const tags = {
        'resonate:origin': id,
        'resonate:branch': id,
        'resonate:parent': id,
        'resonate:scope': 'global',
      };
      const created = await resonate.promises.create(id, Date.now() + 60_000, { tags });
      expect(created.state).toBe('pending');
      await resonate.promises.resolve(id, codec.encode({ ok: true }));
      const read = await resonate.promises.get(id);
      expect(read.state).toBe('resolved');
      // Servers may add their own tags; ours must come back unchanged.
      expect(read.tags).toMatchObject(tags);
      expect(codec.decode(read.value as any)).toEqual({ ok: true });
    } finally {
      await resonate.stop();
    }
  });
});
