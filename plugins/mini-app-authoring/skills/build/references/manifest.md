Read this when you write or change `.localix-mini-app/mini-app.json`, the icon or a command; publishing and signing have their own skill.

# The manifest

## Contents

- Where it lives
- Fields
- A minimal manifest
- Config options
- Commands
- Store media
- `guide.md`

## Where it lives

`.localix-mini-app/mini-app.json` inside the app's folder. Every path in it (`icon`, `backend`, `screenshots`, `guide`) is relative to the app's folder, the one that holds `.localix-mini-app/`. The manifest is **strict**: an unknown key is refused, a plugin's `skills` or `hooks` among them. Mini apps are not plugins (`architecture.md`).

## Fields

| Field | Meaning |
| --- | --- |
| `name` | Required. Letters, numbers, dashes or underscores; namespaces the app's tools and commands |
| `version`, `description` | Required. `version` is semver and the only thing updates compare |
| `displayName` | The name people see; also `author`, `homepage`, `repository`, `license`, `keywords` |
| `apiVersion` | Positive integer, currently `2` (the app layer). A newer one blocks loading; omitting it warns |
| `category` | One of `development`, `data`, `content`, `utilities`, `games` |
| `surfaces` | Defaults to `['agent']`; add `workbench` for a screen (`["agent", "workbench"]` for the usual app) |
| `backend` | Native entrypoint exporting `register(ctx)`; the source stays `./backend/index.ts`, the package names the bundle |
| `guide` | Defaults to `./guide.md` |
| `config` | Settings delivered through `ctx.config` |
| `commands` | Map keyed by command name |
| `icon`, `screenshots`, `tags` | Store media |
| `views` | Up to 6 sandboxed HTML views, each `{ id, title, file, icon?, agentDescription? }` |
| `promptSections` | Up to 3 `{ title, content }` of static prompt text |
| `fileAssociations` | `{ ext, name, description, mimeType, role, rank }` for desktop packaging; `role` is `Editor`, `Viewer`, `Shell` or `None`; `rank` is `Owner`, `Default`, `Alternate` or `None`. Inert for an installed app |
| `private` | Keeps an authoring scaffold out of packaging |

An app with a screen needs `workbench` in `surfaces` and a registered UI (`screens.md`). `views` are for static, sandboxed pages only; a screen with state is `screenUi`, not a view.

## A minimal manifest

```json
{
  "name": "calorie-counter",
  "version": "0.1.0",
  "description": "Logs meals and their calories.",
  "apiVersion": 2,
  "category": "utilities",
  "surfaces": ["agent", "workbench"],
  "backend": "./backend/index.ts",
  "icon": "./icon.svg"
}
```

## Config options

An entry under `config` takes `type` (`string`, `number`, `boolean`, `directory` or `file`), `description`, `required`, `secret`, `default`, `title`, `multiple`, `min` and `max`. A `secret` value is only masked in API responses; use the vault host service when a backend needs a real secret. Prefer no config: pick a default and let the person tell the agent.

## Commands

A command is a macro in the slash menu, `/<app>:<command>`:

```json
{
  "commands": {
    "log": {
      "description": "Log a meal",
      "prompt": "Log this meal with log_meal: $ARGUMENTS",
      "argumentHint": "<what you ate>",
      "featured": true
    }
  }
}
```

Each is `{ prompt, description?, args?, argumentHint?, featured?, activateTools? }`. The `prompt` takes `${name}` for each declared argument, and `$ARGUMENTS` and `$1` as in Claude Code. `args` adds chips and pickers: `type` `text` or `choice`, static `options` or an `optionsScript`, and an optional `{ arg, equals }` condition. `featured` shows it first in the slash menu; `activateTools` switches on up to eight deferred tools while it runs. When to use a command and how to write its prompt: `agent.md`.

## Store media

| Field | Rule |
| --- | --- |
| `icon` | Required to publish. `.svg` (recommended), `.png` or `.webp` of at least 512×512, or `.ico`; square; at most 256 KB; an SVG holds no script |
| `screenshots` | At most 10 `{ path, caption? }`: `.png`, `.jpg`, `.jpeg` or `.webp`, at most 5 MB, never downscaled |
| `tags` | At most 8 lower-case words joined by dashes (`board-game`) |
| `homepage` | An `https://` address |

The first-party icon standard: a 1024 grid, an 896-wide tile with a 64 margin and corner radius 196, filled top to bottom from `#121215` to `#09090b`, with a glyph about 400 wide in `#e7e6e6` at a fine stroke. Draw it with `mini-app icon [folder] --glyph <lucide-name> [--tint #hex]` (the lucide icon the screen uses, such as `chart-column`; `--glyph` also takes 24×24 markup `'<path d="…"/>'` or a `.svg` file); the template's own `icon.svg` is refused. `mini-app check` reports media problems in its **store media** step without failing the build; packing refuses a missing or invalid icon.

## `guide.md`

Plain Markdown for the agent, `./guide.md` by default: which tool does what, when to use it, what to tell the person. The prompt lists each enabled mini app in one line; the agent reads the guide with `MiniAppGuide` before it first uses the app. A tool's description says what it does; the guide says when. Put long material in pages under `guide/`. The template and the `_Use:` line: `agent.md`.
