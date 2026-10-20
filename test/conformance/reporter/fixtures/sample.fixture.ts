import { describe, expect, it } from 'vitest';

describe('Sample', () => {
  describe('nested', () => {
    it('passes', () => {
      expect(1).toBe(1);
    });

    it('fails', () => {
      // A key in a failure message must never reach results/<suite>.json.
      expect('api-key lk_01M5BRDJB0QKR94CP7C5QY256W_abcdefghijklmnopqrstuvwxyzABCDEF').toBe('ok');
    });
  });
});
