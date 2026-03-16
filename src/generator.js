/**
 * Static HTML page generator for KNTIC Links.
 *
 * Produces a single, fully self-contained index.html with all CSS inlined.
 * No JavaScript in the output — works with JS disabled.
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isLinkActive } from './utils.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** HTML-escape a string to prevent XSS. */
function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** MIME type lookup for common image formats. */
function imageMime(filePath) {
  const ext = extname(filePath).toLowerCase();
  const map = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.avif': 'image/avif',
  };
  return map[ext] || 'application/octet-stream';
}

/**
 * Read a local image file and return a base64 data URI.
 * @param {string} filePath — path to the image (absolute or relative to configDir)
 * @param {string} configDir — directory that links.yaml lives in
 * @returns {string} data URI string
 */
export function inlineImage(filePath, configDir) {
  const abs = resolve(configDir, filePath);
  const buf = readFileSync(abs);
  const mime = imageMime(abs);
  return `data:${mime};base64,${buf.toString('base64')}`;
}

// ---------------------------------------------------------------------------
// Schedule filtering
// ---------------------------------------------------------------------------

/**
 * Filter links to only those whose schedule window includes `now`.
 * Links without scheduling fields are always included.
 * Delegates to isLinkActive() from utils.js for per-link evaluation.
 */
export function filterScheduled(links, now = new Date()) {
  if (!links || !Array.isArray(links)) return [];
  return links.filter((link) => isLinkActive(link, now));
}

// ---------------------------------------------------------------------------
// Theme CSS loading
// ---------------------------------------------------------------------------

/**
 * Load theme CSS from the themes directory.
 * @param {string} themeName — name without .css extension
 * @returns {string} CSS content
 */
export function loadThemeCSS(themeName) {
  const themePath = resolve(__dirname, 'themes', `${themeName}.css`);
  try {
    return readFileSync(themePath, 'utf8');
  } catch {
    throw new Error(
      `Theme "${themeName}" not found at ${themePath}. ` +
      'Available themes live in src/themes/.',
    );
  }
}

// ---------------------------------------------------------------------------
// HTML generation
// ---------------------------------------------------------------------------

/**
 * Generate a complete, self-contained HTML page from a links config.
 *
 * @param {object} config — parsed links.yaml config object
 * @param {object} [options]
 * @param {string} [options.configDir=process.cwd()] — directory links.yaml lives in (for resolving relative paths)
 * @param {Date}   [options.now=new Date()]           — current time (for schedule filtering)
 * @returns {string} Complete HTML document
 */
export function generatePage(config, options = {}) {
  const configDir = options.configDir || process.cwd();
  const now = options.now || new Date();

  const name = config.name || 'My Links';
  const bio = config.bio || '';
  const theme = config.theme || 'minimal-dark';

  // Load and inline CSS
  const css = loadThemeCSS(theme);

  // Filter links by schedule
  const allLinks = config.links || [];
  const links = filterScheduled(allLinks, now);
  const totalCount = allLinks.length;
  const activeCount = links.length;
  const buildDate = now.toISOString().slice(0, 10);

  // Avatar handling
  let avatarHTML = '';
  if (config.avatar && config.avatar.trim().length > 0) {
    try {
      const dataUri = inlineImage(config.avatar, configDir);
      avatarHTML = `<img class="profile__avatar" src="${dataUri}" alt="${esc(name)}" width="88" height="88">`;
    } catch {
      // Fallback: reference the file directly (it will be copied to output dir)
      avatarHTML = `<img class="profile__avatar" src="${esc(config.avatar)}" alt="${esc(name)}" width="88" height="88">`;
    }
  }

  // Build link list HTML
  const linksHTML = links.map((link) => {
    const icon = link.icon ? `<span class="links__icon">${esc(link.icon)}</span>` : '';
    const description = link.description
      ? `<span class="links__description">${esc(link.description)}</span>`
      : '';

    return `      <li class="links__item">
        <a class="links__anchor" href="${esc(link.url)}" target="_blank" rel="noopener noreferrer">
          <span class="links__label">${icon}${esc(link.label)}</span>${description}
        </a>
      </li>`;
  }).join('\n');

  // OG description falls back to bio, then a generic string
  const ogDescription = bio || `${name} — link page`;

  return `<!DOCTYPE html>
<!-- built at ${buildDate}, ${activeCount} of ${totalCount} links active -->
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(name)}</title>
  <meta name="description" content="${esc(ogDescription)}">
  <meta property="og:title" content="${esc(name)}">
  <meta property="og:description" content="${esc(ogDescription)}">
  <meta property="og:type" content="website">
  <style>
${css}
  </style>
</head>
<body>
  <section class="profile">
    ${avatarHTML}
    <h1 class="profile__name">${esc(name)}</h1>
${bio ? `    <p class="profile__bio">${esc(bio)}</p>\n` : ''}  </section>

  <ul class="links">
${linksHTML}
  </ul>

  <footer class="footer">
    <a class="footer__link" href="https://kntic.ai">Powered by KNTIC Links</a>
  </footer>
</body>
</html>
`;
}
