/**
 * links remove — Remove an existing link entry.
 *
 * Finds a link by label (case-insensitive), removes it from the config,
 * and writes the updated file atomically.
 */

import { findConfig, readConfig, writeConfig } from '../config.js';

export function registerRemove(program) {
  program
    .command('remove <label>')
    .description('Remove a link')
    .action(async (label) => {
      // Find and read config
      let configPath;
      let config;
      try {
        configPath = findConfig();
        config = readConfig(configPath);
      } catch (err) {
        console.error(`Error: ${err.message}`);
        process.exitCode = 1;
        return;
      }

      const links = config.links || [];

      // Find link by label (case-insensitive)
      const index = links.findIndex(
        (l) => l.label.toLowerCase() === label.toLowerCase(),
      );

      if (index === -1) {
        console.error(`No link with label "${label}" found.`);
        process.exitCode = 1;
        return;
      }

      // Remove the link
      const removed = links.splice(index, 1)[0];
      config.links = links;

      // Write back
      try {
        writeConfig(configPath, config);
      } catch (err) {
        console.error(`Error: could not write links.yaml — ${err.message}`);
        process.exitCode = 1;
        return;
      }

      console.log(`✓ Removed: ${removed.label}`);
    });
}
