import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { listThemes, loadTheme } from '../src/themes/loader.js';

describe('listThemes', () => {
  test('returns array containing all 5 expected theme names', () => {
    const themes = listThemes();
    assert.ok(Array.isArray(themes));
    const expected = ['developer', 'glass', 'minimal-dark', 'minimal-light', 'terminal'];
    for (const name of expected) {
      assert.ok(themes.includes(name), `missing theme: ${name}`);
    }
  });
});

describe('loadTheme', () => {
  test('loads minimal-dark successfully', () => {
    const css = loadTheme('minimal-dark');
    assert.ok(typeof css === 'string');
    assert.ok(css.length > 0);
    assert.ok(css.includes('--accent-color'));
  });

  test('throws descriptive error for unknown theme', () => {
    assert.throws(
      () => loadTheme('nonexistent-theme-xyz'),
      (err) => {
        assert.ok(err.message.includes('nonexistent-theme-xyz'));
        assert.ok(err.message.includes('not found'));
        return true;
      },
    );
  });
});
