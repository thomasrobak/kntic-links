/**
 * Theme loader for KNTIC Links.
 *
 * Resolves theme names to CSS files in src/themes/, reads and returns
 * the CSS string. No build step, no preprocessor — plain CSS only.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname, basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Load a theme's CSS content by name.
 *
 * @param {string} themeName — theme name without the .css extension
 *   (e.g. "minimal-dark")
 * @returns {string} Raw CSS content of the theme file
 * @throws {Error} If the theme file does not exist or cannot be read
 */
export function loadTheme(themeName) {
  if (typeof themeName !== 'string' || themeName.trim().length === 0) {
    throw new Error('Theme name must be a non-empty string.');
  }

  // Sanitise: strip any path separators and .css suffix the caller may have
  // included accidentally. This prevents directory-traversal attempts.
  const sanitised = basename(themeName, '.css');

  const themePath = resolve(__dirname, `${sanitised}.css`);
  try {
    return readFileSync(themePath, 'utf8');
  } catch {
    const available = listThemes();
    const hint = available.length
      ? `Available themes: ${available.join(', ')}`
      : 'No themes are currently installed.';

    throw new Error(
      `Theme "${sanitised}" not found at ${themePath}. ${hint}`,
    );
  }
}

/**
 * List all available theme names (derived from *.css filenames in the
 * themes directory).
 *
 * @returns {string[]} Sorted array of theme names (without .css extension)
 */
export function listThemes() {
  try {
    return readdirSync(__dirname)
      .filter((f) => extname(f) === '.css')
      .map((f) => basename(f, '.css'))
      .sort();
  } catch {
    return [];
  }
}
