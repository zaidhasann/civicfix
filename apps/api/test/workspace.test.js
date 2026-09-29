import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { URL } from 'node:url';
import test from 'node:test';

test('API entrypoint exists', () => {
  assert.equal(existsSync(new URL('../src/app.ts', import.meta.url)), true);
});
