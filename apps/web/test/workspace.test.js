import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { URL } from 'node:url';
import test from 'node:test';

test('web app entrypoint exists', () => {
  assert.equal(existsSync(new URL('../app/page.tsx', import.meta.url)), true);
});
