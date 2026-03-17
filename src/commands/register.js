import { existsSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { findConfig, readConfig, writeConfig, validateUrl } from '../config.js';

const DEFAULT_API = 'https://api.kntic.link/v1';

/** Username format: lowercase alphanumeric + hyphens, 3-30 chars, no leading/trailing hyphen. */
const USERNAME_RE = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/;

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

/** Wrap readline.question in a Promise. */
function ask(rl, query) {
  return new Promise((res) => rl.question(query, (answer) => res(answer)));
}

/**
 * Validate a username string against the format rules.
 * @param {string} name
 * @returns {{ valid: boolean, error?: string }}
 */
function validateUsername(name) {
  if (!USERNAME_RE.test(name)) {
    return {
      valid: false,
      error:
        'Username must be 3-30 characters, lowercase alphanumeric and hyphens only, no leading/trailing hyphen.',
    };
  }
  return { valid: true };
}

/**
 * POST to the /register endpoint with the given body.
 * @param {string} endpoint — full URL to /register
 * @param {object} body — request body
 * @returns {{ response: Response, data: object }}
 */
async function postRegister(endpoint, body) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(`unexpected non-JSON response from ${endpoint}`);
  }

  return { response, data };
}

/**
 * Resolve a username conflict interactively.
 *
 * When the API returns username_taken with suggestions, this function
 * prompts the user to pick a suggestion or type their own username,
 * then retries registration until it succeeds or a non-username_taken
 * error occurs.
 *
 * @param {string} takenName — the username that was taken
 * @param {string[]} suggestions — available username suggestions from the API
 * @param {object} body — the original request body (mutated with new username)
 * @param {string} endpoint — the /register endpoint URL
 * @returns {{ data: object, username: string }} — successful response data and confirmed username
 * @throws {Error} on non-username_taken API errors or network failures
 */
async function resolveUsername(takenName, suggestions, body, endpoint) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  try {
    let currentName = takenName;
    let currentSuggestions = suggestions;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      // Display conflict UI
      console.log(`✖ Username "${currentName}" is already taken.`);
      console.log('');

      let chosenUsername;

      if (currentSuggestions.length > 0) {
        console.log('Suggestions:');
        for (let i = 0; i < currentSuggestions.length; i++) {
          console.log(`  ${i + 1}. ${currentSuggestions[i]}`);
        }
        const customOption = currentSuggestions.length + 1;
        console.log(`  ${customOption}. Enter a different username`);
        console.log('');

        // Prompt for selection
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const answer = (
            await ask(
              rl,
              `Pick a suggestion (1-${currentSuggestions.length}) or choose ${customOption} to type your own: `,
            )
          ).trim();

          const num = parseInt(answer, 10);
          if (Number.isNaN(num) || num < 1 || num > customOption) {
            continue; // re-prompt on invalid input
          }

          if (num <= currentSuggestions.length) {
            // User picked a suggestion
            chosenUsername = currentSuggestions[num - 1];
            break;
          }

          // User wants to type their own — inner prompt loop for format validation
          // eslint-disable-next-line no-constant-condition
          while (true) {
            const custom = (await ask(rl, 'Username: ')).trim();
            const check = validateUsername(custom);
            if (!check.valid) {
              console.log(check.error);
              continue;
            }
            chosenUsername = custom;
            break;
          }
          break;
        }
      } else {
        // No suggestions available — prompt directly for a new username
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const custom = (await ask(rl, 'Enter a different username: ')).trim();
          const check = validateUsername(custom);
          if (!check.valid) {
            console.log(check.error);
            continue;
          }
          chosenUsername = custom;
          break;
        }
      }

      // Retry registration with the chosen username
      body.username = chosenUsername;

      let response, data;
      try {
        ({ response, data } = await postRegister(endpoint, body));
      } catch (err) {
        throw new Error(`network request failed — ${err.message}`);
      }

      // Check for username_taken again → loop
      const isTaken =
        !response.ok &&
        data &&
        (response.status === 409 ||
          data.code === 'username_taken' ||
          data.message === 'username_taken' ||
          data.error === 'username_taken');

      if (isTaken) {
        currentName = chosenUsername;
        currentSuggestions = Array.isArray(data.suggestions) ? data.suggestions : [];
        continue;
      }

      // Non-username_taken error → throw
      if (!response.ok) {
        const msg = data.error || data.message || JSON.stringify(data);
        throw new Error(`registration failed (HTTP ${response.status}) — ${msg}`);
      }

      // Success
      return { data, username: chosenUsername };
    }
  } finally {
    rl.close();
  }
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
        process.exitCode = 1;
        return;
      }

      // --- Find and read config ---
      let configPath;
      try {
        configPath = findConfig();
      } catch {
        console.error('Error: links.yaml not found. Run "links init" first.');
        process.exitCode = 1;
        return;
      }

      let config;
      try {
        config = readConfig(configPath);
      } catch (err) {
        console.error(`Error: ${err.message}`);
        process.exitCode = 1;
        return;
      }

      if (!config.name || typeof config.name !== 'string' || config.name.trim().length === 0) {
        console.error('Error: config.name is required for registration.');
        process.exitCode = 1;
        return;
      }

      // --- Check existing .links.secret ---
      const configDir = dirname(configPath);
      const secretPath = join(configDir, '.links.secret');

      if (existsSync(secretPath) && !opts.force) {
        console.error('A .links.secret file already exists. Use --force to overwrite.');
        process.exitCode = 1;
        return;
      }

      // --- Prompt for username if not set or invalid ---
      let username = config.username;
      if (!username || !validateUsername(username).valid) {
        const rl = createInterface({ input: process.stdin, output: process.stdout });
        try {
          // eslint-disable-next-line no-constant-condition
          while (true) {
            const input = (
              await ask(rl, 'Username (3-30 chars, lowercase, hyphens ok): ')
            ).trim();
            const check = validateUsername(input);
            if (!check.valid) {
              console.log(check.error);
              continue;
            }
            username = input;
            break;
          }
        } finally {
          rl.close();
        }
      }

      // --- Build request body (only include set fields) ---
      const body = { name: config.name, username };
      if (config.bio) body.bio = config.bio;
      if (config.domain) body.domain = config.domain;

      // --- POST to registration endpoint ---
      const endpoint = `${apiUrl.replace(/\/+$/, '')}/register`;
      let response, data;
      try {
        ({ response, data } = await postRegister(endpoint, body));
      } catch (err) {
        console.error(`Error: ${err.message}`);
        process.exitCode = 1;
        return;
      }

      // --- Handle username_taken conflict ---
      let confirmedUsername = data.username || null;

      const isUsernameTaken =
        !response.ok &&
        data &&
        (response.status === 409 ||
          data.code === 'username_taken' ||
          data.message === 'username_taken' ||
          data.error === 'username_taken');

      if (isUsernameTaken) {
        const suggestions = Array.isArray(data.suggestions) ? data.suggestions : [];
        try {
          const result = await resolveUsername(
            body.username || config.name,
            suggestions,
            body,
            endpoint,
          );
          data = result.data;
          confirmedUsername = result.username;
        } catch (err) {
          console.error(`Error: ${err.message}`);
          process.exitCode = 1;
          return;
        }
      } else if (!response.ok) {
        const msg = data.error || data.message || JSON.stringify(data);
        console.error(`Error: registration failed (HTTP ${response.status}) — ${msg}`);
        process.exitCode = 1;
        return;
      }

      if (!data.api_key) {
        console.error('Error: response missing api_key field.');
        process.exitCode = 1;
        return;
      }

      // --- Write .links.secret ---
      writeFileSync(secretPath, data.api_key, 'utf8');

      // --- Write confirmed username to links.yaml ---
      if (confirmedUsername) {
        config.username = confirmedUsername;
        writeConfig(configPath, config);
      }

      // --- Git protection ---
      ensureGitignore(configDir);

      // --- Success output ---
      console.log('✓ Registered successfully!');
      if (confirmedUsername) console.log(`  Username: ${confirmedUsername}`);
      if (data.page_url) console.log(`  Page URL: ${data.page_url}`);
      console.log('  API key saved to .links.secret');
    });
}
