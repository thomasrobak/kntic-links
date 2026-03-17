import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { secretPath, readSecret } from '../src/secret.js';

describe('secretPath', () => {
  test('returns correct absolute path', () => {
    const result = secretPath('/some/dir');
    assert.equal(result, resolve('/some/dir', '.links.secret'));
  });
});

describe('readSecret', () => {
  let tmpDir;

  before(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'links-secret-'));
  });

  after(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test('returns key from valid file', () => {
    writeFileSync(join(tmpDir, '.links.secret'), 'my-api-key-123');
    assert.equal(readSecret(tmpDir), 'my-api-key-123');
  });

  test('returns null for missing file', () => {
    const empty = mkdtempSync(join(tmpdir(), 'links-nosecret-'));
    assert.equal(readSecret(empty), null);
    rmSync(empty, { recursive: true, force: true });
  });

  test('returns null for empty file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'links-emptysecret-'));
    writeFileSync(join(dir, '.links.secret'), '');
    assert.equal(readSecret(dir), null);
    rmSync(dir, { recursive: true, force: true });
  });

  test('trims whitespace', () => {
    writeFileSync(join(tmpDir, '.links.secret'), '  key-with-spaces  \n');
    assert.equal(readSecret(tmpDir), 'key-with-spaces');
  });
});
