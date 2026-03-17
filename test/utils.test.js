import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { isLinkActive } from '../src/utils.js';

describe('isLinkActive', () => {
  const link = (overrides = {}) => ({ label: 'X', url: 'https://x.com', ...overrides });

  test('no dates: always returns true', () => {
    assert.equal(isLinkActive(link()), true);
  });

  test('only scheduled_from in the past: returns true', () => {
    const now = new Date('2026-06-01T00:00:00Z');
    assert.equal(isLinkActive(link({ scheduled_from: '2026-01-01' }), now), true);
  });

  test('only scheduled_from in the future: returns false', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    assert.equal(isLinkActive(link({ scheduled_from: '2026-06-01' }), now), false);
  });

  test('only scheduled_until in the future: returns true', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    assert.equal(isLinkActive(link({ scheduled_until: '2026-12-31' }), now), true);
  });

  test('only scheduled_until in the past: returns false', () => {
    const now = new Date('2026-12-01T00:00:00Z');
    assert.equal(isLinkActive(link({ scheduled_until: '2026-01-01' }), now), false);
  });

  test('both dates, now within window: returns true', () => {
    const now = new Date('2026-06-15T00:00:00Z');
    assert.equal(
      isLinkActive(link({ scheduled_from: '2026-01-01', scheduled_until: '2026-12-31' }), now),
      true,
    );
  });

  test('both dates, now before window: returns false', () => {
    const now = new Date('2025-06-01T00:00:00Z');
    assert.equal(
      isLinkActive(link({ scheduled_from: '2026-01-01', scheduled_until: '2026-12-31' }), now),
      false,
    );
  });

  test('both dates, now after window: returns false', () => {
    const now = new Date('2027-06-01T00:00:00Z');
    assert.equal(
      isLinkActive(link({ scheduled_from: '2026-01-01', scheduled_until: '2026-12-31' }), now),
      false,
    );
  });

  test('bare date (YYYY-MM-DD) for scheduled_until: entire day is active', () => {
    // 23:59:59 UTC on that day should still be active
    const now = new Date('2026-03-17T23:59:59Z');
    assert.equal(isLinkActive(link({ scheduled_until: '2026-03-17' }), now), true);
  });

  test('null link returns false', () => {
    assert.equal(isLinkActive(null), false);
  });

  test('undefined link returns false', () => {
    assert.equal(isLinkActive(undefined), false);
  });
});
