---
name: create
description:
  Create a Localix mini app — a screen, a backend and agent tools that run inside Localix — from a
  description of what it should do, then build it, check it and install it. Use when the person asks
  for a new mini app, a Localix app, a tracker, a dashboard, a workbench panel or a tool for
  Localix.
argument-hint: <what the mini app should do>
allowed-tools: Bash(mini-app:*)
---

# Create a Localix mini app

A **mini app** is Localix's own application format: a screen for the person, a native backend and
tools the chat agent calls. It is not a Claude Code plugin; never put `.claude-plugin/`, `skills/`
or hooks in one.

The request: $ARGUMENTS

## Steps

1. Choose a lower-kebab-case name (`meal-log`), a title people see and a one-sentence description
   from the request. If the request is empty, ask what the app should do.
2. Create it in the current project unless the person named a folder:

   ```bash
   mini-app create <name> --title "<Title>" --description "<what it does>"
   ```

   `--dir <folder>` puts it elsewhere: that folder becomes the app's own folder. The command copies
   the starter (one collection of items, agent tools for it, a list screen with its states, and tests
   for both), renames it for the app, installs the mini app kit of the person's Localix into its
   `node_modules`, checks the copy, and prints the instruction for turning it into the requested app.

3. Follow that printed instruction in its order. It starts with `mini-app doc`, the
   `mini-app-authoring:build` skill: the order of work, and for each kind of app the reference to
   read and the working example to copy from (a tracker, a board per chat, a dashboard, a canvas
   board, a game with its own look, an app that joins Localix's file editors and composer). Decide
   the data and the screens, write `shared/model.ts` first, then the rest in one batch, test, draw
   the icon, then `mini-app check <folder>` until every check passes (`mini-app test <folder> <file>`
   reruns one failing test file). After each edit this plugin's hook reports what in that file breaks
   Localix's rules: fix it right away.
4. Install it with `mini-app install <folder>`. When Localix is not installed, run
   `mini-app build <folder>` instead and say that `/mini-app-authoring:get-localix` installs
   Localix, after which `mini-app install <folder>` puts the app in.
5. Tell the person where it is (Localix's workspace overflow menu, under the app's title), what to
   say or attach in the chat to use it, and the defaults you chose. Offer the next steps, and to
   share it with `/mini-app-authoring:publish`.

## Rules

- Deliver a working, good-looking app in one turn: from `mini-app create` to an installed app you
  have looked at, without ending your turn in between. Build everything that was asked, on real data:
  a request with several kinds of items, views, tables or forms is one app with several collections
  and views, never a thinner one with the rest left for later. Make the choices that have a sensible
  default and name them at the end; ask only what no default can answer.
- Do the work yourself. A subagent started before `shared/model.ts` exists builds against a contract
  that is not there, and steering it costs more than writing the files. The `mini-app-reviewer`
  agent is for before the app is shared — never a gate on installing it.
- Work only inside the mini app's folder. What `mini-app create` prints is the contract: don't
  read `AGENTS.md` now (it repeats that message for later sessions), search `KIT.md` for the module
  that does a job rather than reading it whole, and read that module's props with
  `mini-app api <module>`. Never search the disk for SDK or kit sources: `mini-app api` prints them.
- Build each screen from the closest example: `mini-app doc <example>` lists its files and
  `mini-app doc <example>/<file>` prints one. Copy it, rename the domain, keep its layout, states and
  formatting.
- A mini app's backend runs unsandboxed inside Localix, and an installed one starts enabled: keep
  each tool honest about what it changes.
- Never edit `dist/`, `tsconfig.json` or `KIT.md`: the checks rewrite them.
- Write and change files with the file tools (Write, Edit). A heredoc, `sed -i` or an inline script
  that writes a file can be refused by the permission checks, and each refusal costs a turn.
