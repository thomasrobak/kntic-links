/**
 * links add — Add a new link entry.
 *
 * Reads the nearest links.yaml, appends a new link, and writes it back
 * atomically. Validates the URL and rejects duplicate labels.
 */

import { findConfig, readConfig, writeConfig, validateUrl } from '../config.js';

export function registerAdd(program) {
  program
    .command('add <label> <url>')
    .description('Add a new link')
    .option('--icon <emoji>', 'Icon emoji or name for the link')
    .option('--description <text>', 'Short description of the link')
    .option('--from <date>', 'Scheduled start date (ISO 8601)')
    .option('--until <date>', 'Scheduled end date (ISO 8601)')
    .option('--update', 'Replace an existing link with the same label')
    .action(async (label, url, opts) => {
      // Validate URL
      const urlCheck = validateUrl(url);
      if (!urlCheck.valid) {
        console.error(`Error: ${urlCheck.error}`);
        process.exitCode = 1;
        return;
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

      // Ensure links array exists
      if (!config.links) {
        config.links = [];
      }

      // Check for duplicate label (case-insensitive)
      const existingIndex = config.links.findIndex(
        (l) => l.label.toLowerCase() === label.toLowerCase(),
      );

      if (existingIndex !== -1 && !opts.update) {
        console.error(
          `A link with label "${label}" already exists. Use --update to replace it.`,
        );
        process.exitCode = 1;
        return;
      }

      // Build link object
      const link = { label, url };
      if (opts.icon) link.icon = opts.icon;
      if (opts.description) link.description = opts.description;
      if (opts.from) link.scheduled_from = opts.from;
      if (opts.until) link.scheduled_until = opts.until;

      // Add or replace
      if (existingIndex !== -1) {
        config.links[existingIndex] = link;
      } else {
        config.links.push(link);
      }

      // Write back
      try {
        writeConfig(configPath, config);
      } catch (err) {
        console.error(`Error: could not write links.yaml — ${err.message}`);
        process.exitCode = 1;
        return;
      }

      console.log(`✓ Added: ${label} → ${url}`);
    });
}
