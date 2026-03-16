/**
 * Shared utility helpers for @kntic/links.
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import yaml from 'js-yaml';

/**
 * Default config filename.
 */
export const CONFIG_FILE = 'links.yml';

/**
 * Load and parse the links YAML config from the current directory.
 * @param {string} [dir=process.cwd()] - Directory to look in.
 * @returns {Promise<object>} Parsed config object.
 */
export async function loadConfig(dir = process.cwd()) {
  const filePath = resolve(dir, CONFIG_FILE);
  const raw = await readFile(filePath, 'utf8');
  return yaml.load(raw);
}

/**
 * Pretty-print an error and exit.
 * @param {string} message
 * @param {number} [code=1]
 */
export function fatal(message, code = 1) {
  console.error(`error: ${message}`);
  process.exit(code);
}

// ---------------------------------------------------------------------------
// Link scheduling
// ---------------------------------------------------------------------------

/**
 * Determine whether a link is currently active based on its scheduling fields.
 *
 * Rules:
 *   - No dates → always active
 *   - Only scheduled_from → active from that date onwards (inclusive, >=)
 *   - Only scheduled_until → active until that date (inclusive, <=)
 *   - Both → active within the window [scheduled_from, scheduled_until]
 *
 * All comparisons are performed in UTC using Date.parse().
 *
 * @param {object} link — a link object that may contain scheduled_from / scheduled_until
 * @param {Date}   [now=new Date()] — reference time for the comparison
 * @returns {boolean} true if the link should be included in the current build
 */
export function isLinkActive(link, now = new Date()) {
  if (!link || typeof link !== 'object') return false;

  const ts = now.getTime();

  if (link.scheduled_from) {
    const from = Date.parse(link.scheduled_from);
    if (!Number.isNaN(from) && ts < from) return false;
  }

  if (link.scheduled_until) {
    const until = Date.parse(link.scheduled_until);
    // Inclusive: if only a date (YYYY-MM-DD) is given, Date.parse returns
    // midnight UTC — we treat the entire day as included, so we compare
    // against the end of that day (start-of-next-day minus 1 ms) only when
    // the value looks like a bare date (10 chars, no time component).
    if (!Number.isNaN(until)) {
      const untilEnd =
        typeof link.scheduled_until === 'string' && link.scheduled_until.length === 10
          ? until + 86_400_000 - 1  // end of day
          : until;
      if (ts > untilEnd) return false;
    }
  }

  return true;
}
