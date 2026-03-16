# KNTIC Links — Theme System

Themes are **plain CSS files** that live in `src/themes/`. No build step, no
preprocessor. Each file defines a complete visual identity for a link page by
implementing a fixed set of **CSS custom properties** (design tokens) on `:root`
and using them throughout.

---

## Quick start — creating a new theme

1. Copy an existing theme (e.g. `minimal-dark.css`) to a new file:

   ```bash
   cp src/themes/minimal-dark.css src/themes/my-theme.css
   ```

2. Edit the `:root` block to change colours, fonts, radii, etc.

3. Set the theme in your project's `links.yaml`:

   ```yaml
   theme: my-theme
   ```

4. Run `links deploy --self` to see the result.

---

## Custom property contract

Every theme **must** declare all of the following custom properties inside a
`:root { … }` rule. The generator and the base HTML structure depend on these
tokens — omitting any of them will produce broken or inconsistent output.

| Token | Purpose | Example value |
|---|---|---|
| `--bg-color` | Page background colour | `#0d0d0d` |
| `--bg-secondary` | Card / surface background | `#1a1a1a` |
| `--text-primary` | Primary text colour | `#f0f0f0` |
| `--text-secondary` | Secondary text colour (descriptions) | `#cccccc` |
| `--text-muted` | Muted / de-emphasised text | `#999999` |
| `--accent-color` | Primary accent (link text, highlights) | `#e0e0e0` |
| `--accent-hover` | Accent on hover / focus | `#ffffff` |
| `--link-bg` | Link card background | `var(--bg-secondary)` |
| `--link-bg-hover` | Link card background on hover | `#252525` |
| `--link-border` | Link card border colour | `#333333` |
| `--link-radius` | Link card border-radius | `8px` |
| `--link-padding` | Link card inner padding | `0.875rem 1.25rem` |
| `--font-body` | Body font stack | `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif` |
| `--font-mono` | Monospace font stack (if needed) | `'SF Mono', 'Fira Code', monospace` |
| `--avatar-radius` | Avatar image border-radius | `50%` |
| `--page-max-width` | Max width of the page content column | `480px` |
| `--footer-opacity` | Footer link resting opacity | `0.6` |

### Rules

* **No hardcoded colours outside `:root`** — every colour value used in
  selectors must reference one of the tokens above.
* Themes may add *extra* custom properties for internal use but must **not**
  remove or rename any of the standard tokens.
* The base reset (`box-sizing`, `margin`, `padding`) should be included in
  every theme so each theme is fully self-contained.

---

## Loader API (`src/themes/loader.js`)

The loader is a pure ES-module with two exports:

### `loadTheme(themeName)`

Resolves a theme name (e.g. `"minimal-dark"`) to the corresponding `.css` file
in the themes directory, reads it, and returns the raw CSS string.

* Throws a descriptive `Error` if the theme is not found (includes list of
  available themes).
* Sanitises the input to prevent directory-traversal (uses `path.basename`).

### `listThemes()`

Returns a sorted `string[]` of available theme names (filenames without the
`.css` extension).

```js
import { loadTheme, listThemes } from './themes/loader.js';

console.log(listThemes());       // ['minimal-dark']
const css = loadTheme('minimal-dark');
```

---

## File structure

```
src/themes/
├── loader.js          # Theme loader module
├── minimal-dark.css   # Default theme
├── README.md          # This file
└── <your-theme>.css   # Add your own here
```

---

## Integration with the generator

The generator (`src/generator.js`) loads the theme specified in `links.yaml`
and inlines the full CSS into a `<style>` block in the generated HTML. The
output is a single self-contained file — no external stylesheets.
