---
name: publish
description:
  Share a Localix mini app with other people — its source in a GitHub repository whose workflow
  checks it and releases a marketplace on each version tag — and ship updates to it. Use when the person
  wants to share, publish, release or update a mini app for others.
argument-hint: '[mini app folder]'
allowed-tools: Bash(mini-app:*)
---

# Publish a mini app

People install shared mini apps from a **marketplace**: `mini-app-marketplace.json` beside one
archive per app and its store media, in one place. Localix lists every marketplace a person has
added in Store → **Sources**, and offers each app as `<app>@<marketplace>`.

The marketplace is built by GitHub, not on this computer. The app's repository holds its source, and
the workflow `mini-app ci` writes checks every push. A tag `v<version>` (the version in
`.localix-mini-app/mini-app.json`) makes it release the marketplace, built with the toolchain and kit
of the Localix the app was made with. People add it by the repository alone, `<owner>/<repo>`:
Localix reads `https://github.com/<owner>/<repo>/releases/latest/download/mini-app-marketplace.json`,
an address that never changes.

## Steps

The mini app is `$ARGUMENTS`, or the one in the current folder. Make each choice that has a default
yourself and name it at the end. Ask the person one thing only: the confirmation in step 4.

1. **Who and what.** The publisher is the GitHub login (`gh api user --jq .login`). Without `gh`, or
   signed out, skip to [Without GitHub](#without-github). For an update, raise `version` in
   `.localix-mini-app/mini-app.json`: patch for fixes, minor for new things. Installed copies update by version alone,
   so new content under the same version reaches no one.
2. **Set it up and check it.** Run both before anything leaves the computer:

   ```bash
   mini-app ci <folder> --publisher "<login>" --repository <owner>/<repo>
   mini-app check <folder>
   ```

   The repository is `<login>/<name>` for a first release, or the one the app already has
   (`gh repo view --json nameWithOwner -q .nameWithOwner` in its folder). `mini-app ci` writes
   `.github/workflows/mini-app.yml`, adds what the checks generate (`tsconfig.json`, `KIT.md`,
   `dist/`) to `.gitignore`, keeps the publisher as `author` and the repository as `repository`: the
   app's page in Localix's Store links there, installed from its folder or its marketplace. Fix whatever
   the check reports. Before a **first** release, start the `mini-app-reviewer` agent in the
   background while you do this, and fix what it finds before step 5.

3. **Its own repository.** The app gets a repository of its own, never a commit in the project
   around it. Run `git -C <folder> rev-parse --show-toplevel`:
   - It fails: run `git -C <folder> init -b main`.
   - It prints the app folder itself: that is the app's repository.
   - It prints any other folder: the app sits inside another repository (often the person's
     project). Stop: committing there, or `gh repo create --source`, would publish that project. Say
     so, and offer to move the app to a folder of its own first.

   Then `git -C <folder> add -A` and commit with the message `Release v<version>`.

4. **Confirm, once.** Before the first push, ask: "Create the public repository `<login>/<name>`
   with Meal Log's source and release v0.1.0?" (use the real names). For an app whose repository
   already exists, ask only whether to release v<version>.
5. **Push and tag.**
   - First release:
     `gh repo create <name> --public --source <folder> --push --description "<description>"`
   - Later releases: `git -C <folder> push`.

   Then make sure the release is signed: Localix updates an app on its own only from a signed
   marketplace. If `gh secret list --repo <owner>/<repo>` has no `MINI_APP_SIGNING_KEY`, run
   `mini-app keygen` (it makes the person's key once, in their config folder, and names the file)
   and `gh secret set MINI_APP_SIGNING_KEY --repo <owner>/<repo> < <key file>`. One key signs every
   app the person publishes; never copy it into the app's folder or print it.

   Then tag the version: `git -C <folder> tag v<version> && git -C <folder> push origin v<version>`.

6. **Watch the release.** Wait for the tag's run:

   ```bash
   gh run list --repo <owner>/<repo> --workflow mini-app.yml --event push --limit 1 --json databaseId --jq '.[0].databaseId'
   gh run watch <id> --repo <owner>/<repo> --exit-status
   ```

   If the run failed, read `gh run view <id> --repo <owner>/<repo> --log-failed` and fix the cause.
   Then move the tag to the fix with `git tag -f v<version>` and `git push -f origin v<version>`; no
   release exists yet, so nobody has that version.

7. **Give the repository**, `<owner>/<repo>`, and the link that opens Localix's **Add source**
   dialog filled in: `localix://ui/work-item/mini-app-store/add-marketplace?url=<owner>%2F<repo>`.
   Others can also use Store → **Sources** → **Add source…**, or
   `/mini-app marketplace add <owner>/<repo>`.

8. **Offer to list it in Localix Community** (`localixai/localix-community`), which every Localix
   shows. Only on a yes: fork it with `gh repo fork localixai/localix-community --clone`, add one
   entry to `.localix-mini-app/marketplace.json` in alphabetical order —
   `{ "name": "<name>", "source": { "source": "github", "repo": "<owner>/<repo>" }, "description": "<what it does, 10–2000 characters>", "category": "<category>", "homepage": "https://github.com/<owner>/<repo>" }`
   — run `mini-app marketplace validate --fetch` in the fork, and open a pull request with
   `gh pr create`. The listing points at the app's own marketplace: what the app is, its signature
   and its updates stay the author's; people see it as `<name>@localix-community`.

## Without GitHub

Run `mini-app pack <folder> --publisher "<name>"`. It checks and builds the app into
`<folder>/dist/marketplace`; then `mini-app keygen` (once) and
`mini-app sign <folder>/dist/marketplace` sign it. Say that every file there goes into one HTTPS
folder, whose `mini-app-marketplace.json` address people add, and that
`/mini-app-authoring:publish` with the GitHub CLI signed in (`gh auth login`) does all of this,
updates included.

## What to tell the person

- A marketplace's publisher shows as unverified; only the Localix marketplace verifies publishers.
  Installing from an unverified publisher asks first.
- Installed copies of a signed app take a newer version within six hours, or at once with Update;
  each person can turn that off on the app's page. An unsigned app updates only with Update.
- Keep the signing key: a release signed with a key Localix was not told of shows **Signature
  changed**, and nothing installs or updates from it. To move to a new key, sign one release with
  the old key and `mini-app sign --next-key <new public key>`, then sign with the new one. The next
  release is a raised `version`, a commit, and a tag `v<version>`: GitHub builds the rest.
- To take a version back, the app's entry gets `revoked` with a reason; installed copies of it stop
  at the next read of the marketplace.
- After updating Localix, run `mini-app ci` again: the workflow then builds with the new release.
- Raising `apiVersion` in `.localix-mini-app/mini-app.json` makes an older Localix list the app as needing an update.
