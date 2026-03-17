import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { filterScheduled, extractAccentColor, generatePage } from '../src/generator.js';

// ---------------------------------------------------------------------------
// filterScheduled
// ---------------------------------------------------------------------------

describe('filterScheduled', () => {
  const now = new Date('2026-06-15T12:00:00Z');

  test('filters inactive links correctly', () => {
    const links = [
      { label: 'Active', url: 'https://a.com' },
      { label: 'Future', url: 'https://b.com', scheduled_from: '2027-01-01' },
    ];
    const result = filterScheduled(links, now);
    assert.equal(result.length, 1);
    assert.equal(result[0].label, 'Active');
  });

  test('passes active links through', () => {
    const links = [
      { label: 'A', url: 'https://a.com', scheduled_from: '2026-01-01' },
      { label: 'B', url: 'https://b.com', scheduled_until: '2026-12-31' },
    ];
    assert.equal(filterScheduled(links, now).length, 2);
  });

  test('handles empty array', () => {
    assert.deepEqual(filterScheduled([], now), []);
  });

  test('handles null/undefined input', () => {
    assert.deepEqual(filterScheduled(null, now), []);
    assert.deepEqual(filterScheduled(undefined, now), []);
  });
});

// ---------------------------------------------------------------------------
// extractAccentColor
// ---------------------------------------------------------------------------

describe('extractAccentColor', () => {
  test('extracts --accent-color from CSS string', () => {
    const css = ':root { --accent-color: #ff00ff; --bg: #000; }';
    assert.equal(extractAccentColor(css), '#ff00ff');
  });

  test('returns fallback on missing', () => {
    assert.equal(extractAccentColor('body { color: red; }'), '#6366f1');
  });
});

// ---------------------------------------------------------------------------
// generatePage
// ---------------------------------------------------------------------------

describe('generatePage', () => {
  const baseConfig = {
    name: 'Test User',
    bio: 'Hello world',
    links: [
      { label: 'GitHub', url: 'https://github.com' },
      { label: 'Blog', url: 'https://blog.example.com' },
    ],
  };
  const now = new Date('2026-06-15T12:00:00Z');
  const opts = { now };

  test('output contains <!DOCTYPE html>', () => {
    const html = generatePage(baseConfig, opts);
    assert.ok(html.startsWith('<!DOCTYPE html>'));
  });

  test('contains config.name (escaped)', () => {
    const html = generatePage(baseConfig, opts);
    assert.ok(html.includes('Test User'));
  });

  test('contains config.bio', () => {
    const html = generatePage(baseConfig, opts);
    assert.ok(html.includes('Hello world'));
  });

  test('contains all active link labels', () => {
    const html = generatePage(baseConfig, opts);
    assert.ok(html.includes('GitHub'));
    assert.ok(html.includes('Blog'));
  });

  test('does not contain inactive scheduled link labels', () => {
    const config = {
      ...baseConfig,
      links: [
        ...baseConfig.links,
        { label: 'FutureLink', url: 'https://future.com', scheduled_from: '2027-01-01' },
      ],
    };
    const html = generatePage(config, opts);
    assert.ok(!html.includes('FutureLink'));
  });

  test('contains Powered by KNTIC Links footer', () => {
    const html = generatePage(baseConfig, opts);
    assert.ok(html.includes('Powered by KNTIC Links'));
  });

  test('contains <link rel="icon">', () => {
    const html = generatePage(baseConfig, opts);
    assert.ok(html.includes('rel="icon"'));
  });
});

// ---------------------------------------------------------------------------
// XSS escaping
// ---------------------------------------------------------------------------

describe('generatePage XSS escaping', () => {
  const now = new Date('2026-06-15T12:00:00Z');

  test('XSS-candidate name/bio/label are HTML-escaped', () => {
    const config = {
      name: '<script>alert("xss")</script>',
      bio: 'a & b < c > d "e" \'f\'',
      links: [
        { label: '<img onerror=alert(1)>', url: 'https://safe.com' },
      ],
    };
    const html = generatePage(config, { now });

    // Must not contain raw dangerous chars in user-content areas
    assert.ok(!html.includes('<script>alert'));
    assert.ok(!html.includes('<img onerror'));

    // Must contain escaped versions
    assert.ok(html.includes('&lt;script&gt;'));
    assert.ok(html.includes('&amp;'));
    assert.ok(html.includes('&lt;img'));
  });
});
