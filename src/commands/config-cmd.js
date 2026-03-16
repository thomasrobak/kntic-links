/**
 * links config — Open links.yaml in the user's preferred editor.
 */

import { spawnSync } from 'node:child_process';
import { findConfig } from '../config.js';

export function registerConfig(program) {
  program
    .command('config')
    .description('Open links.yaml in your default editor')
    .action(() => {
      let configPath;
      try {
        configPath = findConfig();
      } catch {
        console.error('No links.yaml found. Run: links init');
        process.exit(1);
      }

      const editor =
        process.env.EDITOR ||
        process.env.VISUAL ||
        'nano';

      const result = spawnSync(editor, [configPath], {
        stdio: 'inherit',
      });

      if (result.error) {
        // If nano wasn't found, try vi as last resort
        if (result.error.code === 'ENOENT' && editor === 'nano') {
          const fallback = spawnSync('vi', [configPath], {
            stdio: 'inherit',
          });
          if (fallback.error) {
            console.error(`Could not open editor. Set $EDITOR and try again.`);
            process.exit(1);
          }
          process.exit(fallback.status ?? 0);
        }

        console.error(`Could not open editor "${editor}": ${result.error.message}`);
        process.exit(1);
      }

      process.exit(result.status ?? 0);
    });
}
