/**
 * Shared helper for reading the .links.secret API key file.
 */

import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const SECRET_FILENAME = '.links.secret';

/**
 * Return the absolute path to .links.secret in the given config directory.
 * @param {string} configDir — directory containing links.yaml
 * @returns {string} Absolute path to .links.secret
 */
export function secretPath(configDir) {
  return resolve(join(configDir, SECRET_FILENAME));
}

/**
 * Read and return the trimmed content of .links.secret, or null if not found / empty.
 * @param {string} configDir — directory containing links.yaml
 * @returns {string|null} The API key string, or null
 */
export function readSecret(configDir) {
  try {
    const content = readFileSync(secretPath(configDir), 'utf8').trim();
    return content.length > 0 ? content : null;
  } catch {
    return null;
  }
}
