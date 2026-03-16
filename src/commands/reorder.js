/**
 * links reorder — Reorder links in links.yaml.
 *
 * Subcommands:
 *   (no args)           — print current order with 1-based indices
 *   move <label> <pos>  — move a link to the given 1-based position
 *   up <label>          — move a link one position up
 *   down <label>        — move a link one position down
 *   set <labels...>     — specify the complete new order by labels
 */

import { findConfig, readConfig, writeConfig } from '../config.js';

/**
 * Print the current link order as a numbered list.
 * @param {object[]} links
 */
function printOrder(links) {
  if (links.length === 0) {
    console.log('No links configured.');
    return;
  }
  links.forEach((link, i) => {
    console.log(`${i + 1}. ${link.label}`);
  });
}

/**
 * Find a link index by label (case-insensitive).
 * @param {object[]} links
 * @param {string} label
 * @returns {number} index or -1
 */
function findByLabel(links, label) {
  return links.findIndex(
    (l) => l.label.toLowerCase() === label.toLowerCase(),
  );
}

export function registerReorder(program) {
  const reorderCmd = program
    .command('reorder')
    .description('Reorder links in links.yaml')
    .action(async () => {
      // No subcommand — print current order
      let config;
      try {
        const configPath = findConfig();
        config = readConfig(configPath);
      } catch (err) {
        console.error(`Error: ${err.message}`);
        process.exitCode = 1;
        return;
      }

      printOrder(config.links || []);
    });

  // --- reorder move <label> <position> ---
  reorderCmd
    .command('move <label> <position>')
    .description('Move a link to the given 1-based position')
    .action(async (label, position) => {
      let configPath, config;
      try {
        configPath = findConfig();
        config = readConfig(configPath);
      } catch (err) {
        console.error(`Error: ${err.message}`);
        process.exitCode = 1;
        return;
      }

      const links = config.links || [];
      const index = findByLabel(links, label);
      if (index === -1) {
        console.error(`No link with label "${label}" found.`);
        process.exitCode = 1;
        return;
      }

      const pos = parseInt(position, 10);
      if (Number.isNaN(pos) || pos < 1 || pos > links.length) {
        console.error(`Invalid position: ${position}. Must be between 1 and ${links.length}.`);
        process.exitCode = 1;
        return;
      }

      // Splice out and insert at new position
      const [item] = links.splice(index, 1);
      links.splice(pos - 1, 0, item);
      config.links = links;

      try {
        writeConfig(configPath, config);
      } catch (err) {
        console.error(`Error: could not write links.yaml — ${err.message}`);
        process.exitCode = 1;
        return;
      }

      console.log(`✓ Moved "${item.label}" to position ${pos}.`);
      printOrder(links);
    });

  // --- reorder up <label> ---
  reorderCmd
    .command('up <label>')
    .description('Move a link one position up')
    .action(async (label) => {
      let configPath, config;
      try {
        configPath = findConfig();
        config = readConfig(configPath);
      } catch (err) {
        console.error(`Error: ${err.message}`);
        process.exitCode = 1;
        return;
      }

      const links = config.links || [];
      const index = findByLabel(links, label);
      if (index === -1) {
        console.error(`No link with label "${label}" found.`);
        process.exitCode = 1;
        return;
      }

      if (index === 0) {
        console.log(`${links[index].label} is already at the top.`);
        return;
      }

      // Swap with previous
      [links[index - 1], links[index]] = [links[index], links[index - 1]];
      config.links = links;

      try {
        writeConfig(configPath, config);
      } catch (err) {
        console.error(`Error: could not write links.yaml — ${err.message}`);
        process.exitCode = 1;
        return;
      }

      console.log(`✓ Moved "${links[index - 1].label}" up to position ${index}.`);
      printOrder(links);
    });

  // --- reorder down <label> ---
  reorderCmd
    .command('down <label>')
    .description('Move a link one position down')
    .action(async (label) => {
      let configPath, config;
      try {
        configPath = findConfig();
        config = readConfig(configPath);
      } catch (err) {
        console.error(`Error: ${err.message}`);
        process.exitCode = 1;
        return;
      }

      const links = config.links || [];
      const index = findByLabel(links, label);
      if (index === -1) {
        console.error(`No link with label "${label}" found.`);
        process.exitCode = 1;
        return;
      }

      if (index === links.length - 1) {
        console.log(`${links[index].label} is already at the bottom.`);
        return;
      }

      // Swap with next
      [links[index], links[index + 1]] = [links[index + 1], links[index]];
      config.links = links;

      try {
        writeConfig(configPath, config);
      } catch (err) {
        console.error(`Error: could not write links.yaml — ${err.message}`);
        process.exitCode = 1;
        return;
      }

      console.log(`✓ Moved "${links[index + 1].label}" down to position ${index + 2}.`);
      printOrder(links);
    });

  // --- reorder set <labels...> ---
  reorderCmd
    .command('set <labels...>')
    .description('Specify the complete new order by passing all labels')
    .action(async (labels) => {
      let configPath, config;
      try {
        configPath = findConfig();
        config = readConfig(configPath);
      } catch (err) {
        console.error(`Error: ${err.message}`);
        process.exitCode = 1;
        return;
      }

      const links = config.links || [];

      if (labels.length !== links.length) {
        console.error(
          `Expected ${links.length} labels but got ${labels.length}. All existing labels must be specified.`,
        );
        process.exitCode = 1;
        return;
      }

      // Validate all provided labels exist and build new order
      const newLinks = [];
      const used = new Set();

      for (const label of labels) {
        const index = findByLabel(links, label);
        if (index === -1) {
          console.error(`No link with label "${label}" found.`);
          process.exitCode = 1;
          return;
        }

        const key = links[index].label.toLowerCase();
        if (used.has(key)) {
          console.error(`Duplicate label "${label}" in arguments.`);
          process.exitCode = 1;
          return;
        }
        used.add(key);
        newLinks.push(links[index]);
      }

      // Verify all existing labels are covered
      for (const link of links) {
        if (!used.has(link.label.toLowerCase())) {
          console.error(`Missing label "${link.label}" — all existing labels must be specified.`);
          process.exitCode = 1;
          return;
        }
      }

      config.links = newLinks;

      try {
        writeConfig(configPath, config);
      } catch (err) {
        console.error(`Error: could not write links.yaml — ${err.message}`);
        process.exitCode = 1;
        return;
      }

      console.log('✓ Links reordered.');
      printOrder(newLinks);
    });
}
