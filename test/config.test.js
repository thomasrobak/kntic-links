import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  validateUrl,
  validateDate,
  validateConfig,
  findConfig,
  readConfig,
  writeConfig,
} from '../src/config.js';

// ---------------------------------------------------------------------------
// validateUrl
// ---------------------------------------------------------------------------

describe('validateUrl', () => {
  test('valid http URL passes', () => {
    const r = validateUrl('http://example.com');
    assert.equal(r.valid, true);
    assert.equal(r.error, undefined);
  });

  test('valid https URL passes', () => {
    const r = validateUrl('https://example.com/path?q=1');
    assert.equal(r.valid, true);
  });

  test('ftp:// URL fails', () => {
    const r = validateUrl('ftp://files.example.com');
    assert.equal(r.valid, false);
    assert.ok(r.error.includes('http://'));
  });

  test('non-URL string fails', () => {
    const r = validateUrl('not-a-url');
    assert.equal(r.valid, false);
  });

  test('empty string fails', () => {
    const r = validateUrl('');
    assert.equal(r.valid, false);
    assert.ok(r.error.includes('non-empty'));
  });

  test('non-string input fails', () => {
    const r = validateUrl(42);
    assert.equal(r.valid, false);
  });
});

// ---------------------------------------------------------------------------
// validateDate
// ---------------------------------------------------------------------------

describe('validateDate', () => {
  test('valid YYYY-MM-DD passes', () => {
    assert.equal(validateDate('2026-03-17').valid, true);
  });

  test('full ISO 8601 passes', () => {
    assert.equal(validateDate('2026-03-17T12:00:00Z').valid, true);
  });

  test('garbage string fails', () => {
    const r = validateDate('not-a-date');
    assert.equal(r.valid, false);
    assert.ok(r.error.includes('not a valid'));
  });

  test('empty string fails', () => {
    assert.equal(validateDate('').valid, false);
  });

  test('non-string input fails', () => {
    assert.equal(validateDate(123).valid, false);
  });
});

// ---------------------------------------------------------------------------
// validateConfig
// ---------------------------------------------------------------------------

describe('validateConfig', () => {
  test('valid minimal config passes', () => {
    const r = validateConfig({ name: 'Test' });
    assert.equal(r.valid, true);
    assert.deepEqual(r.errors, []);
  });

  test('missing name fails', () => {
    const r = validateConfig({});
    assert.equal(r.valid, false);
    assert.ok(r.errors.some((e) => e.includes('name')));
  });

  test('empty string name fails', () => {
    const r = validateConfig({ name: '' });
    assert.equal(r.valid, false);
    assert.ok(r.errors.some((e) => e.includes('name')));
  });

  test('invalid link url field fails', () => {
    const r = validateConfig({
      name: 'Test',
      links: [{ label: 'A', url: 'ftp://bad' }],
    });
    assert.equal(r.valid, false);
    assert.ok(r.errors.some((e) => e.includes('http://')));
  });

  test('multiple errors are all collected (not short-circuited)', () => {
    const r = validateConfig({
      name: '',
      links: [
        { label: '', url: '' },
        { label: 'OK', url: 'ftp://nope' },
      ],
    });
    assert.equal(r.valid, false);
    // At least 3 errors: name, link[0] label, link[0] url
    assert.ok(r.errors.length >= 3, `Expected ≥3 errors, got ${r.errors.length}`);
  });

  test('non-object input fails', () => {
    const r = validateConfig(null);
    assert.equal(r.valid, false);
  });
});

// ---------------------------------------------------------------------------
// findConfig
// ---------------------------------------------------------------------------

describe('findConfig', () => {
  let tmpRoot;

  before(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'links-test-'));
  });

  after(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  test('finds links.yaml in cwd', () => {
    const dir = join(tmpRoot, 'cwd-test');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'links.yaml'), 'name: Test\n');
    const result = findConfig(dir);
    assert.equal(result, join(dir, 'links.yaml'));
  });

  test('finds links.yaml in parent dir', () => {
    const parent = join(tmpRoot, 'parent-test');
    const child = join(parent, 'sub');
    mkdirSync(child, { recursive: true });
    writeFileSync(join(parent, 'links.yaml'), 'name: Test\n');
    const result = findConfig(child);
    assert.equal(result, join(parent, 'links.yaml'));
  });

  test('stops at .git boundary and throws', () => {
    const dir = join(tmpRoot, 'git-boundary');
    const sub = join(dir, 'inner');
    mkdirSync(sub, { recursive: true });
    mkdirSync(join(dir, '.git'), { recursive: true });
    // No links.yaml anywhere
    assert.throws(() => findConfig(sub), /not found.*git root/i);
  });

  test('throws at filesystem root', () => {
    // Use a deep temp path with no links.yaml and no .git
    const deep = join(tmpRoot, 'no-config', 'a', 'b', 'c');
    mkdirSync(deep, { recursive: true });
    // Put a .git at tmpRoot to stop before real filesystem root
    mkdirSync(join(tmpRoot, '.git'), { recursive: true });
    assert.throws(() => findConfig(deep), /not found/i);
  });
});

// ---------------------------------------------------------------------------
// readConfig / writeConfig round-trip
// ---------------------------------------------------------------------------

describe('readConfig / writeConfig round-trip', () => {
  let tmpDir;

  before(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'links-rw-'));
  });

  after(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test('write then read returns deep-equal config', () => {
    const configPath = join(tmpDir, 'links.yaml');
    const config = {
      name: 'Round Trip',
      bio: 'Testing',
      links: [
        { label: 'GitHub', url: 'https://github.com' },
        { label: 'Site', url: 'https://example.com', icon: '🌐' },
      ],
    };

    writeConfig(configPath, config);
    const loaded = readConfig(configPath);
    assert.deepEqual(loaded, config);
  });
});
