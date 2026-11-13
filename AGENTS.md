# AGENTS.md

Instructions for AI coding agents working on this repository.

Localix's own Claude Code plugins and mini apps, installed through Localix's marketplaces like
anyone's. Nothing here is built into Localix Studio, and Studio's code names none of these entries.

## Two formats, never mixed

- A **plugin** (`plugins/<name>`) is Claude Code's format: `.claude-plugin/plugin.json`, `commands/`,
  `skills/`, agents, hooks. It holds no Localix code and no `mini-app.json`.
  [plugins/README.md](plugins/README.md) is its guide.
- A **mini app** (`mini-apps/<name>`) is Localix's own format: `.localix-mini-app/mini-app.json`, a
  `guide.md` the agent reads before it first uses the app, a native backend (`backend/`) and screens
  (`ui/`). It holds no `skills/`, `.claude-plugin/` or hooks.
  [mini-apps/README.md](mini-apps/README.md) is its guide.

Keep the words apart too: nothing about screens, backends or the mini app SDK is a "plugin".

## Layout

- `plugins/`: `mini-app-authoring` (skills, a reviewer agent and an edit hook for making mini apps;
  its `template/AGENTS.md` is what a new mini app's repository starts with) and `team`.
- `mini-apps/`: one folder per app.
- `.claude-plugin/marketplace.json` lists the plugins; `.localix-mini-app/marketplace.json` lists
  the mini apps. An entry's name equals its manifest's name.
- `scripts/`: `check.ts`, `kit.ts`, `pack.ts`, `pre-commit.ts`. `docs/`: guides that span several
  apps.

## Commands

Bun only (`.bun-version`).

```sh
bun install                 # also links the mini app kit (scripts/kit.ts)
bun run check               # what CI runs: the plugins, and every mini app with mini-app check
bun run check <app>         # one mini app
bun run check plugins       # claude plugin validate --strict on each plugin
bun run test:plugins        # the tests of plugins/mini-app-authoring
bun run pack                # the mini app marketplace into dist/marketplace
```

The pre-commit hook checks what is staged. Do not bypass it.

## Rules

- **A plugin change reaches people only when its `version` is raised** in `plugin.json`: raise it
  with every change to the plugin.
- **Adding a plugin or a mini app adds its marketplace entry** in the same change.
- **The kit comes from a Localix Studio release** (`localix.kit` in `package.json`). A mini app
  that needs a new SDK or kit feature needs that Studio release first; to work against a local
  Studio checkout, stage its kit and point `MINI_APP_KIT` at it.
- **Curation belongs here alone.** `featured`, `installByDefault`, `suggestFor` and `collections`
  are read by Localix from this marketplace only; a collection item that names no app here fails
  validation.
- A `v*` tag releases the mini app marketplace, signed. Never tag or push unasked.
- English only. No source file over 300 lines of working code.

## Before you say it is done

`bun run check` for what you touched (`bun run check <app>` or `bun run check plugins`), then look
at a mini app's screens in Localix Studio when its `ui/` changed: the checks do not see the page.
