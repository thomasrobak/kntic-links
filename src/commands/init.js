/**
 * links init — Scaffold a new link page project.
 *
 * Creates a links.yaml with sensible defaults and prints a getting-started
 * message. Safe to run — never overwrites an existing links.yaml unless
 * --force is passed.
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { userInfo } from 'node:os';

// ---------------------------------------------------------------------------
// Template
// ---------------------------------------------------------------------------

function buildTemplate(name) {
  return `# links.yaml — your link-in-bio page configuration
# Docs: links help

name: "${name}"

# Short bio displayed under your name
bio: ""

# Avatar image URL (uncomment and set your image URL)
# avatar: "https://example.com/avatar.png"

# Theme for the generated page
theme: minimal-dark

# Your page URL once deployed (uncomment and set your domain)
# domain: "https://links.example.com"

# Links — add as many as you like
links:
  - label: "My Website"
    url: "https://example.com"
    # icon: "globe"
    # description: "My personal website"

  - label: "Twitter"
    url: "https://twitter.com/example"
    # icon: "twitter"
`;
}

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

export function registerInit(program) {
  program
    .command('init [directory]')
    .description('Initialise a new links project')
    .option('--force', 'Overwrite existing links.yaml', false)
    .action(async (directory, opts) => {
      const targetDir = directory ? resolve(directory) : process.cwd();
      const filePath = join(targetDir, 'links.yaml');

      // If a directory argument was provided, ensure it exists
      if (directory && !existsSync(targetDir)) {
        try {
          mkdirSync(targetDir, { recursive: true });
        } catch (err) {
          console.error(`Error: could not create directory "${targetDir}" — ${err.message}`);
          process.exitCode = 1;
          return;
        }
      }

      // Safety check — never overwrite without --force
      if (existsSync(filePath) && !opts.force) {
        console.error('links.yaml already exists. Use --force to overwrite.');
        process.exitCode = 1;
        return;
      }

      // Resolve a sensible default name
      let defaultName = 'My Links';
      try {
        const info = userInfo();
        if (info.username) {
          defaultName = info.username;
        }
      } catch {
        // userInfo can throw on some platforms — fall back silently
      }

      const content = buildTemplate(defaultName);

      try {
        writeFileSync(filePath, content, 'utf8');
      } catch (err) {
        console.error(`Error: could not write links.yaml — ${err.message}`);
        process.exitCode = 1;
        return;
      }

      // Success message
      const relPath = directory ? join(directory, 'links.yaml') : 'links.yaml';
      console.log(`✔ Created ${relPath}\n`);
      console.log('Next steps:');
      console.log('  links add <label> <url>        Add a link');
      console.log('  links deploy --self --out ./dist  Build your page');
    });
}
