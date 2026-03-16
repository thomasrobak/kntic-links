/**
 * links list — List all configured links.
 *
 * Reads the nearest links.yaml and prints a formatted table of links.
 * Supports --json for machine-readable output.
 */

import chalk from 'chalk';
import { findConfig, readConfig } from '../config.js';

/**
 * Build a schedule status string for a link.
 *
 * Format:
 *   ⏰ from 2026-04-01          (only scheduled_from)
 *   ⏰ until 2026-12-31         (only scheduled_until)
 *   ⏰ 2026-04-01 → 2026-12-31 (both)
 *   ''                          (always active)
 */
function scheduleStatus(link) {
  const hasFrom = !!link.scheduled_from;
  const hasUntil = !!link.scheduled_until;

  if (hasFrom && hasUntil) {
    return `⏰ ${link.scheduled_from} → ${link.scheduled_until}`;
  }
  if (hasFrom) {
    return `⏰ from ${link.scheduled_from}`;
  }
  if (hasUntil) {
    return `⏰ until ${link.scheduled_until}`;
  }
  return '';
}

/**
 * Pad a string to a given width.
 */
function pad(str, width) {
  const len = str.length;
  return len >= width ? str : str + ' '.repeat(width - len);
}

export function registerList(program) {
  program
    .command('list')
    .description('List all links')
    .option('--json', 'Output links as a JSON array')
    .action(async (opts) => {
      // Find and read config
      let config;
      try {
        const configPath = findConfig();
        config = readConfig(configPath);
      } catch (err) {
        console.error(`Error: ${err.message}`);
        process.exitCode = 1;
        return;
      }

      const links = config.links || [];

      if (links.length === 0) {
        console.log('No links yet. Use: links add <label> <url>');
        return;
      }

      // JSON output
      if (opts.json) {
        console.log(JSON.stringify(links, null, 2));
        return;
      }

      // Calculate column widths
      const idxWidth = String(links.length).length;
      let labelWidth = 5; // minimum "LABEL"
      let urlWidth = 3;   // minimum "URL"
      let iconWidth = 0;

      const hasIcons = links.some((l) => l.icon);

      for (const link of links) {
        if (link.label.length > labelWidth) labelWidth = link.label.length;
        if (link.url.length > urlWidth) urlWidth = link.url.length;
        if (link.icon && link.icon.length > iconWidth) iconWidth = link.icon.length;
      }

      // Print header
      let header = `${pad('#', idxWidth)}  ${pad('LABEL', labelWidth)}  ${pad('URL', urlWidth)}`;
      if (hasIcons) header += `  ${pad('ICON', iconWidth)}`;
      header += '  SCHEDULE';
      console.log(chalk.bold(header));
      console.log(chalk.gray('─'.repeat(header.length)));

      // Print rows
      links.forEach((link, i) => {
        const idx = pad(String(i + 1), idxWidth);
        const label = pad(link.label, labelWidth);
        const url = pad(link.url, urlWidth);
        const icon = hasIcons ? `  ${pad(link.icon || '', iconWidth)}` : '';
        const sched = scheduleStatus(link);

        let line = `${chalk.gray(idx)}  ${chalk.cyan(label)}  ${url}${icon}`;
        if (sched) line += `  ${chalk.yellow(sched)}`;
        console.log(line);
      });
    });
}
