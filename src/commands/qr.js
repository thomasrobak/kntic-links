/**
 * links qr — Generate a QR code for the link page URL.
 *
 * Usage:
 *   links qr [url] [options]
 *
 * If url is omitted, uses config.domain from links.yaml.
 * --out <file>   Save QR code as PNG to specified file path.
 * --link <label> Generate QR for a specific link's URL instead of the page URL.
 */

import QRCode from 'qrcode';
import chalk from 'chalk';
import { findConfig, readConfig } from '../config.js';

export function registerQr(program) {
  program
    .command('qr')
    .description('Generate a QR code for the link page URL')
    .argument('[url]', 'URL to encode (defaults to config.domain)')
    .option('--out <file>', 'save QR code as PNG to specified file path')
    .option('--link <label>', 'generate QR for a specific link by label')
    .action(async (urlArg, options) => {
      let url = urlArg;

      // If --link is provided, look up the link's URL from config
      if (options.link) {
        let config;
        try {
          const configPath = findConfig();
          config = readConfig(configPath);
        } catch (err) {
          console.error(chalk.red(err.message));
          process.exitCode = 1;
          return;
        }

        const links = config.links || [];
        const match = links.find(
          (l) => l.label.toLowerCase() === options.link.toLowerCase(),
        );

        if (!match) {
          console.error(
            chalk.red(`Link with label "${options.link}" not found in links.yaml.`),
          );
          process.exitCode = 1;
          return;
        }

        url = match.url;
      }

      // If no URL yet, fall back to config.domain
      if (!url) {
        try {
          const configPath = findConfig();
          const config = readConfig(configPath);

          if (config.domain && config.domain.trim().length > 0) {
            url = config.domain.trim();
            // Ensure it has a protocol
            if (!/^https?:\/\//i.test(url)) {
              url = `https://${url}`;
            }
          }
        } catch {
          // config not found — will fall through to error below
        }
      }

      if (!url) {
        console.error(
          chalk.red(
            'No URL specified and no domain set in links.yaml. Run: links qr <url>',
          ),
        );
        process.exitCode = 1;
        return;
      }

      try {
        if (options.out) {
          // Save as PNG
          await QRCode.toFile(options.out, url);
          console.log(chalk.green(`QR code saved to ${options.out}`));
          console.log(`URL: ${url}`);
        } else {
          // Render to terminal
          const qrString = await QRCode.toString(url, { type: 'terminal' });
          console.log(qrString);
          console.log(`URL: ${url}`);
        }
      } catch (err) {
        console.error(chalk.red(`Failed to generate QR code: ${err.message}`));
        process.exitCode = 1;
      }
    });
}
