/**
 * links deploy — Build and deploy the link page.
 *
 * --self    Generate a self-contained static HTML page locally.
 * (default) Deploy to the hosted kntic.link platform via API key.
 */

import { mkdirSync, writeFileSync, copyFileSync, existsSync, statSync } from 'node:fs';
import { resolve, dirname, basename, join } from 'node:path';
import chalk from 'chalk';
import { dump } from 'js-yaml';
import { findConfig, readConfig } from '../config.js';
import { generatePage } from '../generator.js';
import { readSecret } from '../secret.js';

const DEFAULT_API = 'https://api.kntic.link/v1';

export function registerDeploy(program) {
  program
    .command('deploy')
    .description('Build and deploy the link page')
    .option('--self', 'Generate a self-contained static HTML page')
    .option('--out <dir>', 'Output directory (--self only)', './dist')
    .option('--open', 'Open the generated page in a browser after build (--self only)')
    .option('--api <url>', 'Base URL of the kntic.link API', DEFAULT_API)
    .option('--verbose', 'Print full response body on error (useful for debugging)')
    .action(async (opts) => {
      if (opts.self) {
        await deploySelf(opts);
      } else {
        await deployHosted(opts);
      }
    });
}

// ---------------------------------------------------------------------------
// Hosted deploy (default)
// ---------------------------------------------------------------------------

async function deployHosted(opts) {
  // 1. Locate and read config
  let configPath;
  try {
    configPath = findConfig();
  } catch (err) {
    console.error(chalk.red(`✗ ${err.message}`));
    process.exitCode = 1;
    return;
  }

  let config;
  try {
    config = readConfig(configPath);
  } catch (err) {
    console.error(chalk.red(`✗ ${err.message}`));
    process.exitCode = 1;
    return;
  }

  const configDir = dirname(configPath);

  // 2. Read API key
  const apiKey = readSecret(configDir);
  if (!apiKey) {
    console.error(chalk.red('No API key found. Run: links register'));
    process.exitCode = 1;
    return;
  }

  // 3. POST config as YAML to hosted API
  const apiBase = opts.api.replace(/\/+$/, '');
  const endpoint = `${apiBase}/deploy`;

  let response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/yaml',
        'X-API-Key': apiKey,
      },
      body: dump(config),
    });
  } catch (err) {
    console.error(chalk.red(`✗ Network error: ${err.message}`));
    process.exitCode = 1;
    return;
  }

  // 5. Read body as text first (safe for any content type)
  let rawBody;
  try {
    rawBody = await response.text();
  } catch (err) {
    console.error(chalk.red(`✗ Failed to read response body (HTTP ${response.status}): ${err.message}`));
    process.exitCode = 1;
    return;
  }

  // 6. Try to parse as JSON (may fail for proxies, HTML error pages, etc.)
  let data;
  try {
    data = JSON.parse(rawBody);
  } catch {
    data = null;
  }

  if (!response.ok) {
    let msg;
    if (data && typeof data === 'object') {
      msg = data.error || data.message || data.detail || rawBody;
    } else if (rawBody.length === 0) {
      msg = '(empty response body)';
    } else {
      // Plain text / HTML — show first 200 chars to keep output readable
      msg = rawBody.length > 200 ? rawBody.slice(0, 200) + '…' : rawBody;
    }

    console.error(chalk.red(`✗ Deploy failed (HTTP ${response.status}): ${msg}`));
    if (response.status === 401) {
      console.error(chalk.yellow('Hint: run links register --force to get a new API key.'));
    }
    if (opts.verbose && rawBody.length > 0) {
      console.error(chalk.dim(rawBody));
    }
    process.exitCode = 1;
    return;
  }

  if (!data) {
    console.error(chalk.red(`✗ Unexpected non-JSON success response (HTTP ${response.status})`));
    process.exitCode = 1;
    return;
  }

  // 7. Success
  const pageUrl = data.page_url || '(unknown)';
  console.log(chalk.green(`✓ Deployed to ${pageUrl}`));
}

// ---------------------------------------------------------------------------
// Self-hosted deploy (--self)
// ---------------------------------------------------------------------------

async function deploySelf(opts) {
  // 1. Locate and read config
  let configPath;
  try {
    configPath = findConfig();
  } catch (err) {
    console.error(chalk.red(`✗ ${err.message}`));
    process.exitCode = 1;
    return;
  }

  let config;
  try {
    config = readConfig(configPath);
  } catch (err) {
    console.error(chalk.red(`✗ ${err.message}`));
    process.exitCode = 1;
    return;
  }

  const configDir = dirname(configPath);

  // 2. Generate HTML
  let html;
  try {
    html = generatePage(config, { configDir });
  } catch (err) {
    console.error(chalk.red(`✗ Build failed: ${err.message}`));
    process.exitCode = 1;
    return;
  }

  // 3. Write output
  const outDir = resolve(opts.out);
  mkdirSync(outDir, { recursive: true });

  const outFile = join(outDir, 'index.html');
  writeFileSync(outFile, html, 'utf8');

  // 4. Copy avatar as fallback asset (if it's a local file)
  if (config.avatar && config.avatar.trim().length > 0) {
    const avatarSrc = resolve(configDir, config.avatar);
    if (existsSync(avatarSrc)) {
      try {
        const avatarDest = join(outDir, basename(config.avatar));
        copyFileSync(avatarSrc, avatarDest);
      } catch {
        // non-fatal — avatar is already inlined
      }
    }
  }

  // 5. Summary
  const size = statSync(outFile).size;
  const sizeStr = size < 1024
    ? `${size} B`
    : `${(size / 1024).toFixed(1)} KB`;

  console.log(chalk.green(`✓ Built to ${outFile}`) + chalk.dim(` (${sizeStr})`));

  // 6. Optionally open in browser
  if (opts.open) {
    try {
      const open = (await import('open')).default;
      await open(outFile);
    } catch {
      console.log(chalk.yellow('⚠ Could not open browser automatically.'));
    }
  }
}
