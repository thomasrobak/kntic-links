/**
 * links status — Show current project status summary.
 */

import { statSync } from 'node:fs';
import chalk from 'chalk';
import { findConfig, readConfig } from '../config.js';
import { isLinkActive } from '../utils.js';

export function registerStatus(program) {
  program
    .command('status')
    .description('Show current project status')
    .action(() => {
      let configPath;
      try {
        configPath = findConfig();
      } catch {
        console.error('No links.yaml found. Run: links init');
        process.exit(1);
      }

      const config = readConfig(configPath);
      const links = config.links ?? [];

      // Count scheduled (have scheduling fields) vs active
      const scheduledLinks = links.filter(
        (l) => l.scheduled_from || l.scheduled_until,
      );
      const activeLinks = links.filter((l) => isLinkActive(l));

      // Last modified
      let lastModified = 'unknown';
      try {
        const stat = statSync(configPath);
        lastModified = stat.mtime.toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC');
      } catch {
        // ignore
      }

      // Bio truncation
      const bio = config.bio?.trim() || '';
      const bioDisplay = bio.length > 60 ? bio.slice(0, 57) + '...' : bio || chalk.dim('not set');

      // Domain
      const domain = config.domain?.trim() || '';

      // Output
      console.log();
      console.log(chalk.bold('  Links Project Status'));
      console.log(chalk.dim('  ─────────────────────────────'));
      console.log(`  ${chalk.cyan('Name:')}           ${config.name}`);
      console.log(`  ${chalk.cyan('Bio:')}            ${bioDisplay}`);
      console.log(`  ${chalk.cyan('Theme:')}          ${config.theme || 'minimal-dark'}`);
      console.log(`  ${chalk.cyan('Domain:')}         ${domain || chalk.dim('not set')}`);
      console.log(`  ${chalk.cyan('Avatar:')}         ${config.avatar ? chalk.green('set') : chalk.dim('not set')}`);
      console.log(`  ${chalk.cyan('Total links:')}    ${links.length}`);
      console.log(`  ${chalk.cyan('Active links:')}   ${activeLinks.length}`);
      console.log(`  ${chalk.cyan('Scheduled:')}      ${scheduledLinks.length}`);
      console.log(`  ${chalk.cyan('Last modified:')}  ${lastModified}`);
      console.log(`  ${chalk.cyan('Config:')}         ${configPath}`);
      console.log();
    });
}
