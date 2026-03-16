# @kntic/links

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![npm version](https://img.shields.io/npm/v/@kntic/links)](https://www.npmjs.com/package/@kntic/links)
[![Node >= 18](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)

A CLI for building and deploying link-in-bio pages. No accounts, no tracking, no third-party servers. You own the HTML.

---

## Quick Start

Five commands from zero to a deployed page:

```bash
# 1. Install
npm install -g @kntic/links

# 2. Scaffold a new project
links init my-page && cd my-page

# 3. Add some links
links add "GitHub" "https://github.com/you"
links add "Blog"   "https://your-blog.dev"

# 4. Build a self-contained HTML file
links deploy --self

# 5. Open it
open dist/index.html
```

That's it. `dist/index.html` is a single file — inline CSS, base64 avatar, no external requests. Drop it on any static host.

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
| `links init [directory]` | Scaffold a new `links.yaml` project. `--force` to overwrite. |
| `links add <label> <url>` | Add a link. `--from`/`--until` for scheduling, `--update` to replace. |
| `links remove <label>` | Remove a link by label (case-insensitive). |
| `links list` | List all links. `--json` for machine-readable output. |
| `links deploy --self` | Generate a self-contained HTML page to `dist/`. `--out <dir>` to change output, `--open` to open in browser. |
| `links theme list` | List available themes. |
| `links theme set <name>` | Set the active theme in `links.yaml`. |
| `links qr` | Generate a QR code for your page URL. |
| `links config` | Open `links.yaml` in your `$EDITOR`. |
| `links open` | Open your deployed page URL in the browser. `--local` for `dist/index.html`. |
| `links status` | Show project config summary. |

---

## `links.yaml` Schema

```yaml
# Required
name: "Your Name"
url: "https://your-site.com"

# Optional
bio: "A short bio line."
avatar: "avatar.png"          # Path to image — gets base64-inlined on build
theme: "minimal-dark"          # Any theme name from src/themes/

# Links
links:
  - label: "GitHub"
    url: "https://github.com/you"
  - label: "Blog"
    url: "https://your-blog.dev"
    scheduled_from: "2026-04-01"    # Optional: link becomes visible on this date
    scheduled_until: "2026-12-31"   # Optional: link hidden after this date
```

### Scheduling

Links support `scheduled_from` and `scheduled_until` fields (ISO 8601 date strings). The generator filters links at build time — only active links appear in the output HTML.

---

## Themes

Five built-in themes ship with Links:

| Theme | Description |
|-------|-------------|
| `minimal-dark` | Default. Muted violet accent on dark background. |
| `minimal-light` | Clean off-white with indigo accent. |
| `terminal` | Green-on-black with cursor blink and scanlines. |
| `glass` | Glassmorphism with backdrop-filter blur and purple/blue gradient. |
| `developer` | IDE-inspired aesthetic with KNTIC orange and left border bar. |

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
