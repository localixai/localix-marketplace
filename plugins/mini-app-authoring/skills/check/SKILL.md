---
name: check
description:
  Check a Localix mini app the way Localix judges it — template leftovers, house style, routes,
  store media, message bindings, private keys, manifest, backend and UI builds, types and its tests
  — and fix what fails. Use after changing a mini app, or when the person asks whether one is ready.
argument-hint: '[mini app folder]'
allowed-tools: Bash(mini-app:*)
---

# Check a mini app

Run the checks on the folder the person named, or the current one:

```bash
mini-app check $ARGUMENTS
```

The report lists every step with `ok` or `FAILED`, and each problem on one line with its
`file:line`. Fix every problem, then run the check again; repeat until every step passes. Never
silence a check by deleting a test or loosening a rule.

- **template residue** names what a copy still carries of the starter: rename its `items`
  identifiers and tools after this app's own things, rewrite `guide.md`, and draw the app's own icon
  with `mini-app icon`.
- **style** names each native `<button>`, `<input>`, `<textarea>` or `<select>`: use the kit's
  control instead. Keep a native one only where the element itself is the control — a board square,
  a row that is clicked as a whole, code typed over its highlighted copy — and say why on its line
  or the line above:

  ```tsx
  {
    /* mini-app: native-control — a board square is a bare hit target */
  }
  ;<button className="size-12" onClick={() => play(square)} />
  ```

  The comment waives only that rule on that element. One without a reason after the dash is a
  problem of its own.

- **store media** failing does not stop a build or an install, but packing refuses an app without
  a valid icon. Fix it before publishing.
- **private keys** names a file that holds one. Delete it: the app's folder becomes a public
  repository. A marketplace signing key lives in the person's config folder (`mini-app keygen`) and the
  repository's `MINI_APP_SIGNING_KEY` secret, never beside the app.
- **types** reads the `tsconfig.json` the check writes; the editor's diagnostics read the same one.
- **tests** runs `bun test` with the kit's modules preloaded. A mini app without tests passes this
  step without proving anything: write tests for what the app does.

`mini-app check --json` prints the report as JSON for a script.
