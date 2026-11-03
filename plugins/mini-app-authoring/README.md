# mini-app-authoring

A Claude Code plugin for making [Localix](https://github.com/rsaryev/localix) mini apps — screens, a
backend and agent tools that run inside Localix — and sharing them. It works the same in Claude Code
and in Localix.

It is published in the Localix marketplace (`rsaryev/localix-marketplace`), which Localix trusts and
adds on first start. **In Localix**, install it from the Store (Plugins), then type
`/mini-app-authoring:create` in any chat with what the app should do.

**In Claude Code**, add the marketplace once and install it:

```text
/plugin marketplace add rsaryev/localix-marketplace
/plugin install mini-app-authoring@localix
```

## What it adds

| Part                                | What it does                                                                      |
| ----------------------------------- | --------------------------------------------------------------------------------- |
| `/mini-app-authoring:create <idea>` | Creates a mini app from a description, builds it out, checks it and installs it   |
| `/mini-app-authoring:check`         | Every gate Localix applies, in one report, then fixes what fails                  |
| `/mini-app-authoring:install`       | Builds the package and installs it into the running Localix                       |
| `/mini-app-authoring:publish`       | Puts the source on GitHub; its workflow releases each version tag as a marketplace |
| `/mini-app-authoring:get-localix`   | Installs the latest Localix, verified against the release's checksums             |
| `reference` skill                   | The format and the SDK contract, with recipes; loaded when Claude writes an app   |
| `mini-app-reviewer` agent           | Reviews a mini app for what the checks cannot see, with the reference preloaded   |
| Edit hook                           | After each edit to a mini app's source, reports what breaks Localix's rules       |
| `mini-app` command                  | The toolchain the skills run; on the Bash tool's PATH while the plugin is enabled |

```text
mini-app create <name> [--title "…"] [--description "…"] [--dir <folder>]
mini-app check [folder]      mini-app build [folder]      mini-app install [folder]
mini-app test [folder] [files…]                         mini-app api [module [export] | word]
mini-app pack [folder] --publisher "…" [--out <dir>]      mini-app validate <package | .tar.gz>
mini-app icon [folder] --glyph '<path d="…"/>' [--tint #hex]
mini-app ci [folder] [--publisher "…"] [--repository <owner>/<repo>]
mini-app contract            mini-app kit                 mini-app get-localix
```

A new app is a copy of this plugin's reference app, Daily Log (`template/`), whose plumbing —
routes, storage, the feed that updates an open screen when the agent writes, semantic search — is
the SDK's app layer (`createMiniApp`, `defineCollection`, `useCollection`, `screenUi`).
`mini-app create` prints the whole contract with the instruction, so the agent writes only the
domain and the screen; `mini-app contract` prints it again any time. `mini-app api <module>` prints
what a kit or SDK module exports, with its types — the props of a dialog, a table or a chart — and
`mini-app test [folder] [files…]` runs the app's tests alone, as the check runs them.

## Publishing from GitHub

`mini-app ci` sets an app up to be released from its repository: it writes
`.github/workflows/mini-app.yml`, keeps what the checks generate out of git, and records the
publisher as `author` and the repository as `repository`, which the app's page in Localix's Store
links. The workflow checks every push and pull request. A tag `v<version>` matching the version in
`.localix-mini-app/mini-app.json` makes it pack the app into a marketplace, sign it and attach it to
a GitHub release, so people add `<owner>/<repo>` once and get every later version. It builds against the kit of the Localix release the app was made with, and
checks out only this plugin's folder from the marketplace.

## Marketplaces of mini apps

A repository that keeps several mini apps, or lists other people's, describes them in
`.localix-mini-app/marketplace.json`, in the shape of Claude Code's
`.claude-plugin/marketplace.json`: a `name`, an `owner`, `metadata` and `apps`, each with a
`source` — a folder of the repository (`"./mini-apps/notes"`), a GitHub repository whose latest
release publishes a marketplace (`{ "source": "github", "repo": "ada/notes" }`) or a released
marketplace's address (`{ "source": "url", "url": "https://…" }`). The format is Localix's
[mini app marketplaces](https://localix.ai/docs/extending--mini-app-marketplace).

- `mini-app marketplace validate [file] [--fetch] [--curation]` checks it with Localix's own rules,
  from the kit: unknown fields, sorted unique names, bounded descriptions, `https://` only, folders
  that hold the app they name. With `--fetch` it follows each link to its released marketplace and
  says whether it is signed. Curation (`featured`, `installByDefault`, `suggestFor`, `collections`,
  `blockedArchives`) is refused unless `--curation`: Localix takes it from the Localix marketplace
  alone.
- `mini-app marketplace build [file] [--out dir] [--curation]` checks and packs each folder's app
  and writes the release Localix reads, `mini-app-marketplace.json`, with the links beside them.
  The Localix marketplace and [Localix Community](https://github.com/rsaryev/localix-community) are
  built and checked this way.
- `mini-app sign [folder] [--next-key <key>]` signs a release with `MINI_APP_SIGNING_KEY` or the key
  `mini-app keygen` made. It writes `signingKeys`, the keys of the next release, first: this key's
  own, or the new one it hands over to.

## How it relates to Localix

Localix runs and manages mini apps: it installs, updates, enables and validates them. Making one is
this plugin's job. The two meet in two places:

- **The mini app kit.** Each Localix release publishes the platform a mini app is built against —
  the SDK and UI kit declarations, the host theme, the modules the host lends at runtime, and
  Localix's own validation rules. Localix itself does not carry it: each mini app keeps the kit it
  builds against in its own `node_modules/@localixai/mini-app-kit`, like any development dependency.
  When an app has none, `mini-app` downloads the running Localix release's `mini-app-kit.tar.gz`
  (the latest release's when Localix is not running, runs from source, or that release has none),
  verifies it against the release's `SHA256SUMS.txt`, keeps it in the plugin's data folder and
  installs it into the app. `mini-app kit` says which Localix the app builds against;
  `mini-app kit --update [--version <v>]` installs another release's kit. `MINI_APP_KIT=<folder>`
  names one, such as a kit staged from a Localix checkout. Each kit carries the digest of the mini
  app contract it was staged with (`contract` in `kit.json`, the hash of its `API.md`), and Localix
  reports the one it implements from `GET /health`: the same digest means the kit matches that
  Localix exactly. `mini-app kit` and `mini-app check` say when they differ — a notice, not a
  failure, since an app built against an older Localix runs on a newer one.
- **Installing.** `mini-app install` hands the built package to the running Localix
  (`POST /rpc/mini-apps/install-local`); Localix validates and installs it. A shared marketplace's
  apps install from Localix's Store like any other.

The plugin depends on nothing but Bun (it finds one on PATH, in `~/.bun`, or inside Localix) and
imports nothing from the Localix repository.

## Developing it

```bash
bun test src
bunx tsc --noEmit -p tsconfig.json
```
