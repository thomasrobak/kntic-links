/**
 * links open — Open the deployed page in a browser.
 */

import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import open from 'open';
import { findConfig, readConfig } from '../config.js';

export function registerOpen(program) {
  program
    .command('open')
    .description('Open the deployed page in a browser')
    .option('--local', 'Open the local dist/index.html instead of the live domain')
    .action(async (options) => {
      let configPath;
      try {
        configPath = findConfig();
      } catch {
        if (options.local) {
          // Allow --local even without config
          const localPath = resolve('dist', 'index.html');
          if (!existsSync(localPath)) {
            console.error(`Local file not found: ${localPath}`);
            console.error('Run: links deploy --self');
            process.exit(1);
          }
          await open(`file://${localPath}`);
          return;
        }
        console.error('No links.yaml found. Run: links init');
        process.exit(1);
      }

      if (options.local) {
        const config = readConfig(configPath);
        const outDir = resolve(configPath, '..', 'dist');
        const localPath = resolve(outDir, 'index.html');

        if (!existsSync(localPath)) {
          console.error(`Local file not found: ${localPath}`);
          console.error('Run: links deploy --self');
          process.exit(1);
        }

        await open(`file://${localPath}`);
        console.log(`Opened: file://${localPath}`);
        return;
      }

      // Default: open domain
      const config = readConfig(configPath);
      const domain = config.domain?.trim();

      if (!domain) {
        console.error('No domain set. Use --local to preview, or set domain in links.yaml');
        process.exit(1);
      }

      const url = domain.startsWith('http') ? domain : `https://${domain}`;
      await open(url);
      console.log(`Opened: ${url}`);
    });
}
