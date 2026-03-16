#!/usr/bin/env node

import { createRequire } from 'node:module';
import { Command } from 'commander';

import { registerInit } from './commands/init.js';
import { registerAdd } from './commands/add.js';
import { registerRemove } from './commands/remove.js';
import { registerList } from './commands/list.js';
import { registerDeploy } from './commands/deploy.js';
import { registerTheme } from './commands/theme.js';
import { registerQr } from './commands/qr.js';
import { registerConfig } from './commands/config-cmd.js';
import { registerOpen } from './commands/open-cmd.js';
import { registerStatus } from './commands/status.js';
import { registerReorder } from './commands/reorder.js';
import { registerEdit } from './commands/edit.js';

const require = createRequire(import.meta.url);
const { version } = require('../package.json');

const program = new Command();

program
  .name('links')
  .description('CLI tool for managing and deploying link-in-bio pages')
  .version(version);

// Register all subcommands
registerInit(program);
registerAdd(program);
registerRemove(program);
registerList(program);
registerDeploy(program);
registerTheme(program);
registerQr(program);
registerConfig(program);
registerOpen(program);
registerStatus(program);
registerReorder(program);
registerEdit(program);

program.parse();
