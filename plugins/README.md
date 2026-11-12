# Plugins

Localix's own Claude Code plugins. Each folder here is one plugin in Claude Code's format
(`.claude-plugin/plugin.json`, `commands/`, `skills/` and the rest), with no Localix code and no
`mini-app.json`. Mini apps are a separate product and live in
[`mini-apps/`](../mini-apps/README.md); see
[plugins and mini apps](https://github.com/localixai/localix-studio/blob/main/docs/internals/plugins-and-mini-apps.md).

| Plugin                                      | What it adds                                                                            |
| ------------------------------------------- | --------------------------------------------------------------------------------------- |
| [`mini-app-authoring`](mini-app-authoring/) | Skills, a reviewer agent and an edit hook to create, check, install and share mini apps |
| [`team`](team/)                             | Starter specialist agents: architect, backend, frontend, design and devops              |

## How they ship

The repository's [`.claude-plugin/marketplace.json`](../.claude-plugin/marketplace.json) lists them
as the `localix` marketplace. Localix trusts it and adds it on first start, so they install from the
Store (**Plugins**) like any other plugin; nothing is built into Localix. In Claude Code:

```bash
claude plugin marketplace add localixai/localix-marketplace
claude plugin install mini-app-authoring@localix
```

Each plugin's `localix` key also says what Localix's Store does with it — `featured`,
`installByDefault` (installed on its own on a new installation) and `suggestFor`, the files and
dependencies a project has when the plugin is worth suggesting (`mini-app.json` for
`mini-app-authoring`) — and `metadata.localix.collections` holds Discover's rows, where a mini app is
named by its identity (`mini-app:code-graph@localix`). Claude Code ignores both; Localix reads them
from this marketplace only.

A change reaches people when they update the plugin, so raise its `version` with each change.

## Add one

1. Create `plugins/<name>/.claude-plugin/plugin.json` with a `name`, `version` and `description`,
   and the components in Claude Code's default folders.
2. Add its entry to `.claude-plugin/marketplace.json` with `"source": "./plugins/<name>"`.
3. Load it in Claude Code with `claude --plugin-dir plugins/<name>`. `bun run check plugins` runs
   `claude plugin validate --strict` on it.

See [Claude Code plugins](https://localix.ai/docs/extending--plugin-updates).
