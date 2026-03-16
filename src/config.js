import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import yaml from 'js-yaml';

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

/**
 * Validate that a URL string starts with http:// or https://.
 * @param {string} url
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateUrl(url) {
  if (typeof url !== 'string' || url.length === 0) {
    return { valid: false, error: 'url must be a non-empty string' };
  }
  if (!/^https?:\/\//i.test(url)) {
    return { valid: false, error: `url must start with http:// or https:// — got "${url}"` };
  }
  return { valid: true };
}

/**
 * Validate that a string is a valid ISO 8601 date (YYYY-MM-DD or full ISO 8601).
 * @param {string} str
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateDate(str) {
  if (typeof str !== 'string' || str.length === 0) {
    return { valid: false, error: 'date must be a non-empty string' };
  }
  if (Number.isNaN(Date.parse(str))) {
    return { valid: false, error: `not a valid ISO 8601 date — got "${str}"` };
  }
  return { valid: true };
}

/**
 * Validate a full config object against the links.yaml schema.
 * Collects all errors instead of failing on the first one.
 * @param {object} config
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateConfig(config) {
  const errors = [];

  if (config === null || typeof config !== 'object' || Array.isArray(config)) {
    return { valid: false, errors: ['links.yaml: config must be a YAML mapping (object)'] };
  }

  // --- top-level required fields ---
  if (typeof config.name !== 'string' || config.name.trim().length === 0) {
    errors.push("links.yaml: missing required field 'name' (must be a non-empty string)");
  }

  // --- top-level optional string fields ---
  for (const field of ['bio', 'avatar', 'domain']) {
    if (config[field] !== undefined && config[field] !== null && typeof config[field] !== 'string') {
      errors.push(`links.yaml: field '${field}' must be a string`);
    }
  }

  // --- theme ---
  if (config.theme !== undefined && config.theme !== null) {
    if (typeof config.theme !== 'string' || config.theme.trim().length === 0) {
      errors.push("links.yaml: field 'theme' must be a non-empty string");
    }
  }

  // --- links array ---
  if (config.links !== undefined && config.links !== null) {
    if (!Array.isArray(config.links)) {
      errors.push("links.yaml: field 'links' must be an array");
    } else {
      config.links.forEach((link, i) => {
        const prefix = `links.yaml: links[${i}]`;

        if (link === null || typeof link !== 'object' || Array.isArray(link)) {
          errors.push(`${prefix} must be an object`);
          return;
        }

        // required
        if (typeof link.label !== 'string' || link.label.trim().length === 0) {
          errors.push(`${prefix}: missing required field 'label' (must be a non-empty string)`);
        }
        if (typeof link.url !== 'string' || link.url.trim().length === 0) {
          errors.push(`${prefix}: missing required field 'url' (must be a non-empty string)`);
        } else {
          const urlCheck = validateUrl(link.url);
          if (!urlCheck.valid) {
            errors.push(`${prefix}: ${urlCheck.error}`);
          }
        }

        // optional strings
        for (const field of ['icon', 'description']) {
          if (link[field] !== undefined && link[field] !== null && typeof link[field] !== 'string') {
            errors.push(`${prefix}: field '${field}' must be a string`);
          }
        }

        // optional ISO date strings
        for (const field of ['scheduled_from', 'scheduled_until']) {
          if (link[field] !== undefined && link[field] !== null) {
            if (typeof link[field] !== 'string') {
              errors.push(`${prefix}: field '${field}' must be an ISO 8601 date string`);
            } else {
              const dateCheck = validateDate(link[field]);
              if (!dateCheck.valid) {
                errors.push(`${prefix}: field '${field}' — ${dateCheck.error}`);
              }
            }
          }
        }
      });
    }
  }

  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// Config file discovery
// ---------------------------------------------------------------------------

/**
 * Walk up from `startDir` (defaults to cwd) looking for links.yaml.
 * @param {string} [startDir=process.cwd()]
 * @returns {string} Absolute path to the nearest links.yaml.
 * @throws {Error} If no links.yaml is found before reaching the filesystem root.
 */
export function findConfig(startDir = process.cwd()) {
  let dir = resolve(startDir);

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const candidate = join(dir, 'links.yaml');
    try {
      readFileSync(candidate); // existence check
      return candidate;
    } catch {
      // not found — check for git root boundary before climbing
      if (existsSync(join(dir, '.git'))) {
        throw new Error(
          'links.yaml not found (stopped at git root). Run "links init" to create a new project.',
        );
      }
    }

    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error(
        'links.yaml not found. Run "links init" to create a new project.',
      );
    }
    dir = parent;
  }
}

// ---------------------------------------------------------------------------
// Read / Write
// ---------------------------------------------------------------------------

/**
 * Read, parse, and validate a links.yaml file.
 * @param {string} filePath — absolute or relative path to links.yaml
 * @returns {object} Parsed and validated config object.
 * @throws {Error} On read failure, YAML parse failure, or validation failure.
 */
export function readConfig(filePath) {
  let raw;
  try {
    raw = readFileSync(resolve(filePath), 'utf8');
  } catch (err) {
    throw new Error(`links.yaml: unable to read file "${filePath}" — ${err.message}`);
  }

  let config;
  try {
    config = yaml.load(raw);
  } catch (err) {
    throw new Error(`links.yaml: YAML parse error — ${err.message}`);
  }

  const { valid, errors } = validateConfig(config);
  if (!valid) {
    throw new Error(errors.join('\n'));
  }

  return config;
}

/**
 * Serialize a config object to YAML and write it atomically.
 * Writes to a temporary file first, then renames into place.
 * @param {string} filePath — absolute or relative path to links.yaml
 * @param {object} config — config object to persist
 */
export function writeConfig(filePath, config) {
  const dest = resolve(filePath);
  const tmp = `${dest}.tmp`;

  const content = yaml.dump(config, {
    lineWidth: 120,
    noRefs: true,
    sortKeys: false,
  });

  writeFileSync(tmp, content, 'utf8');
  renameSync(tmp, dest);
}
