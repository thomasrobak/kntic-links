# @kntic/links

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![npm version](https://img.shields.io/npm/v/@kntic/links)](https://www.npmjs.com/package/@kntic/links)
[![Node >= 18](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)

A CLI for building and deploying link-in-bio pages. No tracking, no third-party JS. Self-host a single HTML file, or deploy to kntic.link in one command.

Find more information on [kntic.link](https://kntic.link)

---

## Quick Start

### Self-hosted (default)

```bash
npm install -g @kntic/links

links init my-page && cd my-page
links add "GitHub" "https://github.com/you"
links add "Blog"   "https://your-blog.dev"
links deploy --self
open dist/index.html
```

`dist/index.html` is a single file — inline CSS, base64 avatar, zero external requests. Drop it on any static host.

### Hosted (kntic.link)

```bash
links init my-page && cd my-page
links add "GitHub" "https://github.com/you"
links register          # create account, save API key
links deploy            # page live at username.kntic.link
```

---

## Install

```bash
npm install -g @kntic/links
```

Requires Node.js 18 or later.

---

## Command Reference

| Command | Description |
|---------|-------------|
| `links init [directory]` | Scaffold a new `links.yaml` project. `--force` to overwrite. One-shot flags: `--name`, `--bio`, `--theme`, `--domain`, `--avatar`, `--link "label,url"` (repeatable). `-e`/`--edit` opens the file in `$EDITOR` after scaffolding. |
| `links add <label> <url>` | Add a link. `--icon <emoji>`, `--description <text>`, `--from`/`--until` for scheduling, `--update` to replace an existing link. |
| `links remove <label>` | Remove a link by label (case-insensitive). |
| `links list` | List all links. `--json` for machine-readable output. |
| `links edit <label>` | Edit a link in-place. `--url`, `--label`, `--icon`, `--description`, `--from`, `--until`. Use `--no-icon`, `--no-description`, `--no-from`, `--no-until` to remove a field. |
| `links reorder` | Print current link order. Subcommands: `move <label> <pos>`, `up <label>`, `down <label>`, `set <labels...>`. |
| `links deploy --self` | Generate a self-contained HTML page to `dist/`. `--out <dir>` to change output, `--open` to open in browser. |
| `links deploy` | Deploy to the hosted kntic.link platform. Requires `links register` first. `--api <url>` to override API endpoint. `--verbose` for debug output. |
| `links register` | Register with kntic.link. Prompts for username if not in `links.yaml`. Saves API key to `.links.secret`. `--api <url>` to override endpoint. `--force` to overwrite existing key. |
| `links theme list` | List available themes. |
| `links theme set <name>` | Set the active theme in `links.yaml`. |
| `links qr` | Generate a QR code for your page URL. `--out <file>` to save as PNG. `--link <label>` for a specific link. |
| `links config` | Open `links.yaml` in your `$EDITOR`. |
| `links open` | Open your deployed page URL in the browser. `--local` for `dist/index.html`. |
| `links status` | Show project config summary. |

---

## Hosted Deploy

Two steps to go live on kntic.link:

**1. Register**

```bash
links register
```

Creates an account on the hosted platform. If your `links.yaml` doesn't have a `username` field, you'll be prompted to pick one (lowercase alphanumeric + hyphens, 3–30 chars). If the name is taken, the server suggests alternatives.

The API key is saved to `.links.secret` in the same directory as `links.yaml`. This file is automatically added to `.gitignore`. **Never commit `.links.secret`.**

**2. Deploy**

```bash
links deploy
```

Sends your `links.yaml` config to the backend. Your page goes live at `username.kntic.link`. Run it again after any change to update.

Use `--verbose` to print full response details on error.

The self-hosted path (`links deploy --self`) still works exactly the same — no account needed.

---

## `links.yaml` Schema

```yaml
# Required
name: "Your Name"
domain: "https://your-site.com"

# Optional
bio: "A short bio line."
avatar: "avatar.png"          # Path to image — gets base64-inlined on build
theme: "minimal-dark"          # Any theme name from src/themes/
username: "yourname"           # Set automatically by links register

# Links
links:
  - label: "GitHub"
    url: "https://github.com/you"
  - label: "Blog"
    url: "https://your-blog.dev"
    icon: "📝"                     # Optional emoji displayed next to the link
    description: "My dev blog"     # Optional short description
    scheduled_from: "2026-04-01"   # Optional: link visible from this date
    scheduled_until: "2026-12-31"  # Optional: link hidden after this date
```

### Scheduling

Links support `scheduled_from` and `scheduled_until` fields (ISO 8601 date strings). The generator filters links at build time — only active links appear in the output HTML.

### `.links.secret`

Created by `links register`. Contains your API key for hosted deploys. Automatically added to `.gitignore`. One key per project. Use `links register --force` to regenerate.

---

## Themes

Ten built-in themes ship with Links:

| Theme | Description |
|-------|-------------|
| `minimal-dark` | Default. Muted violet accent on dark background. |
| `minimal-light` | Clean off-white with indigo accent. |
| `terminal` | Green-on-black with cursor blink and scanlines. |
| `glass` | Glassmorphism with backdrop-filter blur and purple/blue gradient. |
| `developer` | IDE-inspired aesthetic with KNTIC orange and left border bar. |
| `brutalist` | Stark white, black borders, no border-radius, bold sans-serif. |
| `gradient-wave` | Animated dark gradient background, white cards, soft rounded. |
| `newspaper` | Sepia tones, serif type, thin rules, masthead heading. |
| `neon-noir` | Near-black with neon cyan/magenta accents and glow on hover. |
| `soft-paper` | Warm off-white, dusty rose accent, generous radius, subtle shadows. |

```bash
# List themes
links theme list

# Switch theme
links theme set terminal

# Rebuild
links deploy --self
```

### Custom Themes

Themes are plain CSS files. Copy any built-in theme and override the 17 CSS custom properties. See [`src/themes/README.md`](src/themes/README.md) for the full token contract.

> 📸 **Screenshots coming soon.**

---

## Self-Hosted by Default

`links deploy --self` generates a single HTML file with everything inlined:

- CSS is embedded in a `<style>` tag
- Avatar is base64-encoded into an `<img>` src
- Zero external requests — no fonts CDN, no analytics, no tracking

Upload `dist/index.html` anywhere: Nginx, S3, GitHub Pages, Netlify, a Raspberry Pi — it doesn't matter.

---

## Contributing

1. Fork the repo
2. Create a feature branch
3. Make your changes (themes are a great first contribution)
4. Submit a merge request

Please keep the zero-dependency-on-external-services philosophy. If it can be done with a single HTML file, it should be.

---

## License

[MIT](LICENSE) © 2026 KNTIC
