# MEMORY.MD — Persistent Working Memory

>
> **Last Updated:** 2026-03-16 (LINKS-013 completed)

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
