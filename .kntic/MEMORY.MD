# MEMORY.MD — Persistent Working Memory

>
> **Last Updated:** 2026-03-18 (LINKS-021 completed)

---

## 1. Current Project State

**Project:** Links
**Repository:** *(update with your gitlab host/group/project)*

### Completed Tasks (Merged)
| Task ID | Title | Key Output |
|---------|-------|------------|
| LINKS-001 | Repo scaffold — package.json, CLI entry point, project structure | `package.json`, `src/cli.js`, 10 command stubs, `LICENSE`, `.npmignore`, `.gitignore`, `package-lock.json` |
| LINKS-002 | links.yaml config schema and parser | `src/config.js` — DEFAULT_CONFIG, validateUrl, validateConfig, findConfig, readConfig, writeConfig; atomic writes via tmp+rename; no external validation deps |
| LINKS-003 | `links init` — scaffold a new link page project | `src/commands/init.js` — creates links.yaml with commented template, --force flag, optional [directory] arg, uses os.userInfo() for default name |
| LINKS-004 | `links add / remove / list` — link management commands | `src/commands/add.js`, `src/commands/remove.js`, `src/commands/list.js` — add/remove/list links in links.yaml; URL validation, case-insensitive label matching, --update flag, --json output, scheduled link display |
| LINKS-005 | `links deploy --self` — static HTML generator | `src/generator.js` — generatePage(config, options), filterScheduled(), loadThemeCSS(), inlineImage(); `src/commands/deploy.js` — --self, --out, --open flags; `src/themes/minimal-dark.css` — default theme; fully self-contained HTML with inlined CSS, base64 avatar, schedule filtering, XSS-safe escaping |
| LINKS-006 | Theme system — CSS-based, pluggable | `src/themes/loader.js` — loadTheme(name), listThemes(); `src/themes/README.md` — documents 17 CSS custom property contract; `minimal-dark.css` updated to standard tokens; directory-traversal protection via path.basename |
| LINKS-007 | 5 launch themes | `minimal-dark.css` (default, muted violet accent), `minimal-light.css` (off-white, indigo accent), `terminal.css` (green-on-black, cursor blink, scanline, JetBrains Mono), `glass.css` (glassmorphism, backdrop-filter blur, purple/blue gradient), `developer.css` (IDE aesthetic, KNTIC orange, left border bar, `$ open` prefix) — all 17 tokens + full selector coverage |
| LINKS-010 | Link scheduling — scheduled_from and scheduled_until | `src/utils.js` — isLinkActive(link, now); `src/config.js` — validateDate(str); `src/generator.js` — uses isLinkActive, adds `<!-- built at ... -->` comment; `src/commands/list.js` — ⏰ schedule display with →; `src/commands/add.js` — --from/--until flags (already present from LINKS-004) |
| LINKS-011 | Utility commands — config, open, status | `src/commands/config-cmd.js` — opens links.yaml in $EDITOR/$VISUAL/nano/vi; `src/commands/open-cmd.js` — opens domain in browser (or --local for dist/index.html); `src/commands/status.js` — displays config summary with chalk formatting |
| LINKS-012 | npm publish prep — README, .npmignore, MIT license, package.json polish | `README.md` — complete with quick start, command reference, schema reference, themes section; `package.json` — keywords, homepage, repository, bugs, engines, files whitelist, prepublishOnly script; `.npmignore` verified; `npm pack --dry-run` confirmed 26 files / 19.4 kB tarball |
| LINKS-013 | `links reorder` — reorder links in links.yaml | `src/commands/reorder.js` — subcommands: (no args) print order, move/up/down/set; case-insensitive label matching; `src/cli.js` updated to register reorder command |
| LINKS-014 | `links edit` — edit an existing link's properties | `src/commands/edit.js` — flag-driven editing: --label, --url, --icon, --description, --from, --until + --no-* variants to remove fields; case-insensitive lookup; rename collision detection; `src/cli.js` updated |
| LINKS-015 | Favicon — inline SVG favicon in generated page | `src/generator.js` — extractAccentColor(css) helper; two-tier favicon: Strategy A reuses avatar base64 data URI, Strategy B generates 64x64 SVG letter favicon with theme accent color; both `<link rel="icon">` + `sizes="32x32"` fallback; all inlined, no extra files |
| LINKS-019 | `links deploy` update — hosted deploy via API key | `src/secret.js` — readSecret(configDir), secretPath(configDir); `src/commands/deploy.js` — hosted deploy via POST to /deploy with Bearer token from .links.secret; --api flag (default https://api.kntic.link); --self path unchanged; HTTP 401/4xx/5xx/network error handling |
| TEST-001 | Unit test suite — node:test, full coverage of pure logic, GIA hook | `test/config.test.js`, `test/utils.test.js`, `test/generator.test.js`, `test/secret.test.js`, `test/themes.test.js` — 55 tests covering all pure logic modules; `package.json` test script; `.kntic/hooks/gia/specific/001-unit-tests.sh` GIA hook |
| LINKS-020 | `links register` — username conflict handling with suggestions loop | `src/commands/register.js` — resolveUsername() helper with interactive readline loop; detects username_taken (code field + suggestions array); displays numbered suggestions + custom entry option; client-side format validation (USERNAME_RE); retry loop until success; writes confirmed username to links.yaml via writeConfig(); `src/config.js` — validateConfig accepts optional `username` string field |
| BUG-007 | deploy: fix auth header, content-type and request body to match backend API | `src/commands/deploy.js` — deployHosted() corrected to use `X-API-Key` header, YAML content type, raw YAML body via `dump(config)`; removed `generatePage()` call from hosted path (backend generates HTML); added `import { dump } from 'js-yaml'` |
| LINKS-021 | 5 new themes — brutalist, gradient-wave, newspaper, neon-noir, soft-paper | `src/themes/brutalist.css` (stark white, black borders, no radius, bold sans-serif), `src/themes/gradient-wave.css` (animated dark gradient bg, white cards, soft rounded), `src/themes/newspaper.css` (sepia, serif, thin rules, masthead heading), `src/themes/neon-noir.css` (near-black, neon cyan/magenta, glow hover, sans-serif), `src/themes/soft-paper.css` (warm off-white, dusty rose, 16px radius, subtle shadows) — all 17 tokens, 10 total themes |

### Active Services
- **Dashboard** → `http://localhost:8000`
- **Orchestrator** → `kntic-engine` container

---

## 2. Architectural Constraints

Refer to `.kntic/adrs/` for all platform-level constraints:

| ADR | File | Title | Key Rule |
|-----|------|-------|----------|
| ADR-001 | ADR-001-Bootstrapping.md | Manifest-Driven Orchestration | FSM statuses: todo, in_progress, refactoring, needs_review, ready_for_merge, merged, backlog |
| ADR-002 | ADR-002-Security-Isolation.md | Security Isolation — Least Privilege | Mount only what the service needs; default `:ro`; dashboard sandboxed |
| ADR-003 | ADR-003-Task-Schema.md | Task Manifest Schema | Required fields: task_id, title, status; omission rule (no null/empty) |
| ADR-004 | ADR-004-GIA-State-File-Contract.md | GIA State File Contract | `.kntic/gia/state.json` — atomic writes; pass/fail only; dashboard read-only |
| ADR-005 | ADR-005-Technical-Debt-Task-Convention.md | Technical Debt Task Convention | TD- prefix; mandatory MEMORY.MD §3 update on resolution |
| ADR-006 | ADR-006-ADR-Guidelines.md | ADR Guidelines | Mandatory sections: Title, Status, Context, Decision, Consequences |
| ADR-007 | ADR-007-Proposal-Format-And-Handling.md | Proposal Format and Handling | Proposals in `.kntic/docs/`; feeds into ADR pipeline |

---

## 3. Known Technical Debt

| ID | Description | Severity | Origin |
|----|-------------|----------|--------|
| TD-1 | Orchestrator (`kntic-engine`) mounts `.:/app` full project root — should be narrowed to specific paths for least-privilege compliance. | Medium | ADR-002 §1 |

---

## 4. Active Protocol Notes

### For Task Agents
1. **Read this file first** at the start of every session.
2. **Update this file last** after completing a task.
3. **Manifest lifecycle:** `in_progress` → `ready_for_merge`. Orchestrator sets `merged`.
4. **Scope discipline:** Only read/write files listed in your manifest's `context_scope`.
5. **Security first:** Default to `:ro` for volume mounts. Escalate only with justification (ADR-002 §6).
6. **Actions log:** Append one entry to the manifest's `actions` array per session (ADR-003).
7. **New manifests:** Apply `chmod 664` + `chown root:node` immediately after creating (ADR-002 §4).

### Volume Mount Strategy (ADR-002)
- Dashboard mounts are granular and `:ro` by default.
- Only `.kntic/manifests/` and `.kntic/docs/` are writable by the dashboard.
- The orchestrator (`kntic-engine`) currently mounts `.:/app` full access — narrowing this is tracked as TD-1 in ADR-002.
- Write access escalation requires manifest justification + ADR-002 §2 table update.

---

## 5. [Questions for Human]

_No open questions._

---

## 6. [Additional Info from Human]

_No additional info yet._
