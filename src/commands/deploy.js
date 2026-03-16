/**
 * links deploy --self — Build a self-contained static HTML page.
 */

import { mkdirSync, writeFileSync, copyFileSync, existsSync, statSync } from 'node:fs';
import { resolve, dirname, basename, join } from 'node:path';
import chalk from 'chalk';
import { findConfig, readConfig } from '../config.js';
import { generatePage } from '../generator.js';

export function registerDeploy(program) {
  program
    .command('deploy')
    .description('Build and deploy the link page')
    .option('--self', 'Generate a self-contained static HTML page')
    .option('--out <dir>', 'Output directory', './dist')
    .option('--open', 'Open the generated page in a browser after build')
    .action(async (opts) => {
      if (!opts.self) {
        console.log(
          chalk.yellow('Usage: links deploy --self [--out <dir>] [--open]'),
        );
        console.log('Other deploy targets are not yet implemented.');
        process.exitCode = 1;
        return;
      }

      // 1. Locate and read config
      let configPath;
      try {
        configPath = findConfig();
      } catch (err) {
        console.error(chalk.red(`✗ ${err.message}`));
        process.exitCode = 1;
        return;
      }

      let config;
      try {
        config = readConfig(configPath);
      } catch (err) {
        console.error(chalk.red(`✗ ${err.message}`));
        process.exitCode = 1;
        return;
      }

      const configDir = dirname(configPath);

      // 2. Generate HTML
      let html;
      try {
        html = generatePage(config, { configDir });
      } catch (err) {
        console.error(chalk.red(`✗ Build failed: ${err.message}`));
        process.exitCode = 1;
        return;
      }

      // 3. Write output
      const outDir = resolve(opts.out);
      mkdirSync(outDir, { recursive: true });

      const outFile = join(outDir, 'index.html');
      writeFileSync(outFile, html, 'utf8');

      // 4. Copy avatar as fallback asset (if it's a local file)
      if (config.avatar && config.avatar.trim().length > 0) {
        const avatarSrc = resolve(configDir, config.avatar);
        if (existsSync(avatarSrc)) {
          try {
            const avatarDest = join(outDir, basename(config.avatar));
            copyFileSync(avatarSrc, avatarDest);
          } catch {
            // non-fatal — avatar is already inlined
          }
        }
      }

      // 5. Summary
      const size = statSync(outFile).size;
      const sizeStr = size < 1024
        ? `${size} B`
        : `${(size / 1024).toFixed(1)} KB`;

      console.log(chalk.green(`✓ Built to ${outFile}`) + chalk.dim(` (${sizeStr})`));

      // 6. Optionally open in browser
      if (opts.open) {
        try {
          const open = (await import('open')).default;
          await open(outFile);
        } catch {
          console.log(chalk.yellow('⚠ Could not open browser automatically.'));
        }
      }
    });
}
