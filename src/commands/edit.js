/**
 * links edit — Edit an existing link's properties in-place.
 *
 * Only specified flags are changed; everything else is left untouched.
 * Supports --no-<flag> to remove optional fields entirely.
 */

import { findConfig, readConfig, writeConfig, validateUrl, validateDate } from '../config.js';

export function registerEdit(program) {
  program
    .command('edit <label>')
    .description('Edit an existing link')
    .option('--label <new-label>', 'Rename the link')
    .option('--url <url>', 'Update the URL')
    .option('--icon <emoji>', 'Set or update the icon')
    .option('--no-icon', 'Remove the icon')
    .option('--description <text>', 'Set or update the description')
    .option('--no-description', 'Remove the description')
    .option('--from <date>', 'Set or update scheduled_from (ISO 8601)')
    .option('--no-from', 'Remove scheduled_from')
    .option('--until <date>', 'Set or update scheduled_until (ISO 8601)')
    .option('--no-until', 'Remove scheduled_until')
    .action(async (label, opts) => {
      // Detect whether any editing flags were actually provided.
      // Commander sets --no-icon to icon=false, --icon <v> to icon=<v>,
      // and leaves icon=undefined when neither is passed. However,
      // Commander pre-populates boolean defaults for --no-* pairs:
      // when neither --icon nor --no-icon is passed, opts.icon is true (default).
      // We need to check rawArgs or compare against defaults.
      const hasLabel = opts.label !== undefined;
      const hasUrl = opts.url !== undefined;
      // For --no-* pairs: Commander sets default to true. Explicitly passed
      // --icon <val> gives a string; --no-icon gives false; default is true.
      const hasIcon = typeof opts.icon === 'string' || opts.icon === false;
      const hasDescription = typeof opts.description === 'string' || opts.description === false;
      const hasFrom = typeof opts.from === 'string' || opts.from === false;
      const hasUntil = typeof opts.until === 'string' || opts.until === false;

      const hasAnyOption = hasLabel || hasUrl || hasIcon || hasDescription || hasFrom || hasUntil;

      if (!hasAnyOption) {
        console.log(
          'Usage: links edit <label> [--url <url>] [--label <new>] [--icon <emoji>] [--description <text>] [--from <date>] [--until <date>]',
        );
        return;
      }

      // Validate inputs before touching config
      if (hasUrl) {
        const urlCheck = validateUrl(opts.url);
        if (!urlCheck.valid) {
          console.error(`Error: ${urlCheck.error}`);
          process.exitCode = 1;
          return;
        }
      }
      if (typeof opts.from === 'string') {
        const fromCheck = validateDate(opts.from);
        if (!fromCheck.valid) {
          console.error(`Error: --from: ${fromCheck.error}`);
          process.exitCode = 1;
          return;
        }
      }
      if (typeof opts.until === 'string') {
        const untilCheck = validateDate(opts.until);
        if (!untilCheck.valid) {
          console.error(`Error: --until: ${untilCheck.error}`);
          process.exitCode = 1;
          return;
        }
      }

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

      if (!config.links) {
        config.links = [];
      }

      // Find link by label (case-insensitive)
      const existingIndex = config.links.findIndex(
        (l) => l.label.toLowerCase() === label.toLowerCase(),
      );

      if (existingIndex === -1) {
        console.error(`No link with label "${label}" found.`);
        process.exitCode = 1;
        return;
      }

      // Check rename collision
      if (hasLabel) {
        const collision = config.links.findIndex(
          (l, i) => i !== existingIndex && l.label.toLowerCase() === opts.label.toLowerCase(),
        );
        if (collision !== -1) {
          console.error(`A link with label "${opts.label}" already exists.`);
          process.exitCode = 1;
          return;
        }
      }

      const link = config.links[existingIndex];
      const oldLabel = link.label;
      const renamed = hasLabel && opts.label !== oldLabel;

      // Apply changes — only specified flags
      if (hasLabel) link.label = opts.label;
      if (hasUrl) link.url = opts.url;

      if (typeof opts.icon === 'string') {
        link.icon = opts.icon;
      } else if (opts.icon === false) {
        delete link.icon;
      }

      if (typeof opts.description === 'string') {
        link.description = opts.description;
      } else if (opts.description === false) {
        delete link.description;
      }

      if (typeof opts.from === 'string') {
        link.scheduled_from = opts.from;
      } else if (opts.from === false) {
        delete link.scheduled_from;
      }

      if (typeof opts.until === 'string') {
        link.scheduled_until = opts.until;
      } else if (opts.until === false) {
        delete link.scheduled_until;
      }

      // Write back
      try {
        writeConfig(configPath, config);
      } catch (err) {
        console.error(`Error: could not write links.yaml — ${err.message}`);
        process.exitCode = 1;
        return;
      }

      // Output message
      if (renamed) {
        const otherChanges = hasUrl || hasIcon || hasDescription || hasFrom || hasUntil;
        if (otherChanges) {
          console.log(`✓ Renamed "${oldLabel}" → "${link.label}" and updated.`);
        } else {
          console.log(`✓ Renamed "${oldLabel}" → "${link.label}"`);
        }
      } else {
        console.log(`✓ Updated: ${link.label}`);
      }
    });
}
