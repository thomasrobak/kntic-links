/**
 * links theme — Switch and list themes.
 *
 * Subcommands:
 *   links theme list        — list available themes (default)
 *   links theme set <name>  — set the active theme in links.yaml
 *   links theme              — alias for `links theme list`
 */

import { findConfig, readConfig, writeConfig } from '../config.js';
import { listThemes } from '../themes/loader.js';

/**
 * Print the list of available themes, marking the active one with ✓.
 * @param {string} activeTheme — currently configured theme name
 */
function printThemeList(activeTheme) {
  const themes = listThemes();

  if (themes.length === 0) {
    console.log('No themes installed.');
    return;
  }

  for (const name of themes) {
    const marker = name === activeTheme ? ' ✓' : '';
    console.log(`  ${name}${marker}`);
  }
}

export function registerTheme(program) {
  const themeCmd = program
    .command('theme')
    .description('Switch and list themes')
    .action(() => {
      // `links theme` with no subcommand → default to list behaviour
      try {
        const configPath = findConfig();
        const config = readConfig(configPath);
        printThemeList(config.theme || 'minimal-dark');
      } catch (err) {
        console.error(err.message);
        process.exit(1);
      }
    });

  // --- links theme list ---------------------------------------------------
  themeCmd
    .command('list')
    .description('List available themes')
    .action(() => {
      try {
        const configPath = findConfig();
        const config = readConfig(configPath);
        printThemeList(config.theme || 'minimal-dark');
      } catch (err) {
        console.error(err.message);
        process.exit(1);
      }
    });

  // --- links theme set <name> ---------------------------------------------
  themeCmd
    .command('set <name>')
    .description('Set the active theme')
    .action((name) => {
      try {
        const available = listThemes();

        if (!available.includes(name)) {
          console.error(`Unknown theme: ${name}. Run: links theme list`);
          process.exit(1);
        }

        const configPath = findConfig();
        const config = readConfig(configPath);
        config.theme = name;
        writeConfig(configPath, config);

        console.log(`✓ Theme set to: ${name}. Rebuild with: links deploy --self`);
      } catch (err) {
        console.error(err.message);
        process.exit(1);
      }
    });
}
