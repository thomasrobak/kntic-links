import { existsSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { findConfig, readConfig, validateUrl } from '../config.js';

const DEFAULT_API = 'https://api.kntic.link';

/**
 * Walk up from `startDir` looking for a .git directory.
 * Returns the directory containing .git, or null if not found.
 */
function findGitRoot(startDir) {
  let dir = resolve(startDir);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (existsSync(join(dir, '.git'))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * Ensure .links.secret is listed in .gitignore at the git root.
 * Creates .gitignore if it doesn't exist.
 * @param {string} configDir — directory containing links.yaml
 */
function ensureGitignore(configDir) {
  const gitRoot = findGitRoot(configDir);
  if (!gitRoot) return; // not a git repo — nothing to do

  const gitignorePath = join(gitRoot, '.gitignore');
  const entry = '.links.secret';

  if (existsSync(gitignorePath)) {
    const content = readFileSync(gitignorePath, 'utf8');
    const lines = content.split(/\r?\n/);
    if (lines.some((l) => l.trim() === entry)) return; // already present
    const separator = content.endsWith('\n') ? '' : '\n';
    writeFileSync(gitignorePath, `${content}${separator}${entry}\n`, 'utf8');
  } else {
    writeFileSync(gitignorePath, `${entry}\n`, 'utf8');
  }

  console.log('✓ Added .links.secret to .gitignore');
}

/**
 * Register the `links register` command with the Commander program.
 * @param {import('commander').Command} program
 */
export function registerRegister(program) {
  program
    .command('register')
    .description('Register this project with the kntic.link hosted platform')
    .option('--api <url>', 'Base URL of the kntic.link API', DEFAULT_API)
    .option('--force', 'Overwrite an existing .links.secret file')
    .action(async (opts) => {
      // --- Validate --api URL ---
      const apiUrl = opts.api;
      const urlCheck = validateUrl(apiUrl);
      if (!urlCheck.valid) {
        console.error(`Error: invalid --api URL — ${urlCheck.error}`);
        process.exit(1);
      }

      // --- Find and read config ---
      let configPath;
      try {
        configPath = findConfig();
      } catch {
        console.error('Error: links.yaml not found. Run "links init" first.');
        process.exit(1);
      }

      let config;
      try {
        config = readConfig(configPath);
      } catch (err) {
        console.error(`Error: ${err.message}`);
        process.exit(1);
      }

      if (!config.name || typeof config.name !== 'string' || config.name.trim().length === 0) {
        console.error('Error: config.name is required for registration.');
        process.exit(1);
      }

      // --- Check existing .links.secret ---
      const configDir = dirname(configPath);
      const secretPath = join(configDir, '.links.secret');

      if (existsSync(secretPath) && !opts.force) {
        console.error('A .links.secret file already exists. Use --force to overwrite.');
        process.exit(1);
      }

      // --- Build request body (only include set fields) ---
      const body = { name: config.name };
      if (config.bio) body.bio = config.bio;
      if (config.domain) body.domain = config.domain;

      // --- POST to registration endpoint ---
      const endpoint = `${apiUrl.replace(/\/+$/, '')}/register`;
      let response;
      try {
        response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      } catch (err) {
        console.error(`Error: network request failed — ${err.message}`);
        process.exit(1);
      }

      // --- Handle response ---
      let data;
      try {
        data = await response.json();
      } catch {
        console.error(`Error: unexpected non-JSON response from ${endpoint}`);
        process.exit(1);
      }

      if (!response.ok) {
        const msg = data.error || data.message || JSON.stringify(data);
        console.error(`Error: registration failed (HTTP ${response.status}) — ${msg}`);
        process.exit(1);
      }

      if (!data.api_key) {
        console.error('Error: response missing api_key field.');
        process.exit(1);
      }

      // --- Write .links.secret ---
      writeFileSync(secretPath, data.api_key, 'utf8');

      // --- Git protection ---
      ensureGitignore(configDir);

      // --- Success output ---
      console.log('✓ Registered successfully!');
      if (data.username) console.log(`  Username: ${data.username}`);
      if (data.page_url) console.log(`  Page URL: ${data.page_url}`);
      console.log('  API key saved to .links.secret');
    });
}
