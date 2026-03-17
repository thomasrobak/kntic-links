/**
 * links init — Scaffold a new link page project.
 *
 * Three modes:
 *   1. ONE-SHOT:     Any of --name/--bio/--theme/--link/--domain/--avatar →
 *                    build links.yaml from flags, no prompts.
 *   2. INTERACTIVE:  Default (no one-shot flags, no --edit) → prompt for each
 *                    field sequentially; all fields skippable.
 *   3. EDIT:         --edit / -e → open links.yaml in $EDITOR (scaffold first
 *                    if missing).
 *
 * All modes respect --force for overwrite protection.
 */

import { existsSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { userInfo } from 'node:os';
import { createInterface } from 'node:readline';
import { spawnSync } from 'node:child_process';

import { writeConfig } from '../config.js';
import { validateUrl } from '../config.js';
import { listThemes } from '../themes/loader.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Resolve a sensible default name from the OS. */
function defaultUsername() {
  try {
    const info = userInfo();
    if (info.username) return info.username;
  } catch {
    // userInfo can throw on some platforms
  }
  return 'My Links';
}

/** Wrap readline.question in a Promise. */
function ask(rl, query) {
  return new Promise((res) => rl.question(query, (answer) => res(answer)));
}

/**
 * Parse a "label,url" string — split on the first comma only so that URLs
 * containing commas are handled correctly.
 */
function parseLinkFlag(raw) {
  const idx = raw.indexOf(',');
  if (idx === -1) {
    return { error: `Invalid --link format: expected "label,url" — got "${raw}"` };
  }
  const label = raw.slice(0, idx).trim();
  const url = raw.slice(idx + 1).trim();
  if (!label) return { error: `Invalid --link: label is empty — got "${raw}"` };
  if (!url) return { error: `Invalid --link: url is empty — got "${raw}"` };
  return { label, url };
}

/** Build a config object with sensible defaults. */
function buildDefaultConfig(name) {
  return {
    name: name || defaultUsername(),
    bio: '',
    theme: 'minimal-dark',
    links: [],
  };
}

// ---------------------------------------------------------------------------
// One-shot mode
// ---------------------------------------------------------------------------

function runOneShot(opts) {
  const themes = listThemes();

  // Validate --theme
  if (opts.theme && !themes.includes(opts.theme)) {
    console.error(`Error: unknown theme "${opts.theme}". Available: ${themes.join(', ')}`);
    process.exitCode = 1;
    return null;
  }

  const config = buildDefaultConfig(opts.name);
  if (opts.bio !== undefined) config.bio = opts.bio;
  if (opts.theme) config.theme = opts.theme;
  if (opts.domain) config.domain = opts.domain;
  if (opts.avatar) config.avatar = opts.avatar;

  // Parse --link entries
  const linkFlags = opts.link || [];
  for (const raw of linkFlags) {
    const parsed = parseLinkFlag(raw);
    if (parsed.error) {
      console.error(`Error: ${parsed.error}`);
      process.exitCode = 1;
      return null;
    }
    const urlCheck = validateUrl(parsed.url);
    if (!urlCheck.valid) {
      console.error(`Error: ${urlCheck.error}`);
      process.exitCode = 1;
      return null;
    }
    config.links.push({ label: parsed.label, url: parsed.url });
  }

  return config;
}

// ---------------------------------------------------------------------------
// Interactive mode
// ---------------------------------------------------------------------------

async function runInteractive() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const themes = listThemes();
  const defName = defaultUsername();

  try {
    const name = (await ask(rl, `Name [${defName}]: `)).trim() || defName;
    const bio = (await ask(rl, 'Bio []: ')).trim();
    const themeHint = themes.length ? ` (${themes.join(', ')})` : '';
    let theme = (await ask(rl, `Theme [minimal-dark]${themeHint}: `)).trim() || 'minimal-dark';

    // Validate theme — re-prompt on bad value
    while (themes.length && !themes.includes(theme)) {
      console.log(`Unknown theme "${theme}". Available: ${themes.join(', ')}`);
      theme = (await ask(rl, `Theme [minimal-dark]${themeHint}: `)).trim() || 'minimal-dark';
    }

    const domain = (await ask(rl, 'Domain []: ')).trim();
    const avatar = (await ask(rl, 'Avatar URL []: ')).trim();

    const config = { name, bio, theme, links: [] };
    if (domain) config.domain = domain;
    if (avatar) config.avatar = avatar;

    // Link loop
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const linkInput = (await ask(rl, 'Add a link? (label,url or Enter to skip): ')).trim();
      if (!linkInput) break;

      const parsed = parseLinkFlag(linkInput);
      if (parsed.error) {
        console.log(parsed.error);
        continue;
      }
      const urlCheck = validateUrl(parsed.url);
      if (!urlCheck.valid) {
        console.log(`Invalid URL: ${urlCheck.error}`);
        continue;
      }
      config.links.push({ label: parsed.label, url: parsed.url });
    }

    return config;
  } finally {
    rl.close();
  }
}

// ---------------------------------------------------------------------------
// Edit mode
// ---------------------------------------------------------------------------

function runEdit(filePath) {
  const editor = process.env.EDITOR || process.env.VISUAL || 'nano';

  // If file doesn't exist, scaffold it first
  if (!existsSync(filePath)) {
    const config = buildDefaultConfig();
    config.links = [
      { label: 'My Website', url: 'https://example.com' },
      { label: 'Twitter', url: 'https://twitter.com/example' },
    ];
    writeConfig(filePath, config);
  }

  const result = spawnSync(editor, [filePath], { stdio: 'inherit' });

  if (result.error) {
    console.error(`Error: could not open editor "${editor}" — ${result.error.message}`);
    process.exitCode = 1;
    return;
  }
  if (result.status !== 0) {
    console.error(`Editor exited with code ${result.status}`);
    process.exitCode = result.status;
  }
}

// ---------------------------------------------------------------------------
// Command registration
// ---------------------------------------------------------------------------

export function registerInit(program) {
  program
    .command('init [directory]')
    .description('Initialise a new links project')
    .option('--force', 'Overwrite existing links.yaml', false)
    .option('--name <string>', 'Set the name field (one-shot)')
    .option('--bio <string>', 'Set the bio field (one-shot)')
    .option('--theme <string>', 'Set the theme (one-shot)')
    .option('--domain <string>', 'Set the domain field (one-shot)')
    .option('--avatar <string>', 'Set the avatar field (one-shot)')
    .option('--link <label,url>', 'Add a link (repeatable, one-shot)', (val, acc) => {
      acc.push(val);
      return acc;
    }, [])
    .option('-e, --edit', 'Open links.yaml in $EDITOR', false)
    .action(async (directory, opts) => {
      const targetDir = directory ? resolve(directory) : process.cwd();
      const filePath = join(targetDir, 'links.yaml');

      // Ensure target directory exists when specified
      if (directory && !existsSync(targetDir)) {
        try {
          mkdirSync(targetDir, { recursive: true });
        } catch (err) {
          console.error(`Error: could not create directory "${targetDir}" — ${err.message}`);
          process.exitCode = 1;
          return;
        }
      }

      // Determine mode
      const oneShotFlags = ['name', 'bio', 'theme', 'domain', 'avatar'];
      const hasOneShot =
        oneShotFlags.some((f) => opts[f] !== undefined) || opts.link.length > 0;

      // --edit mode
      if (opts.edit) {
        // For edit mode: if file exists and --force not given, just open it.
        // If file doesn't exist, scaffold first (runEdit handles this).
        // If file exists and --force is given, scaffold fresh then open.
        if (existsSync(filePath) && opts.force) {
          const config = buildDefaultConfig();
          config.links = [
            { label: 'My Website', url: 'https://example.com' },
            { label: 'Twitter', url: 'https://twitter.com/example' },
          ];
          writeConfig(filePath, config);
        }
        runEdit(filePath);
        return;
      }

      // Overwrite protection (applies to one-shot and interactive)
      if (existsSync(filePath) && !opts.force) {
        console.error('links.yaml already exists. Use --force to overwrite.');
        process.exitCode = 1;
        return;
      }

      let config;

      if (hasOneShot) {
        // One-shot mode
        config = runOneShot(opts);
        if (!config) return; // validation failed, exitCode already set
      } else {
        // Interactive mode
        config = await runInteractive();
      }

      // Write config
      try {
        writeConfig(filePath, config);
      } catch (err) {
        console.error(`Error: could not write links.yaml — ${err.message}`);
        process.exitCode = 1;
        return;
      }

      // Success message
      const relPath = directory ? join(directory, 'links.yaml') : 'links.yaml';
      console.log(`\n✔ Created ${relPath}\n`);
      console.log('Next steps:');
      console.log('  links add <label> <url>           Add a link');
      console.log('  links init --edit                  Edit config in $EDITOR');
      console.log('  links deploy --self --out ./dist   Build your page');
    });
}
