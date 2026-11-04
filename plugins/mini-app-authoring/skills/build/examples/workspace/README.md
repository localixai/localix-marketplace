# Example Workspace

A worked example of a mini app that lives **inside** Localix's own surfaces instead of drawing a screen
of its own: a file editor, a tool card, a strip above the composer, a chat action, `@` mentions and
buttons into the workspace and the terminal. The domain is small on purpose: HTTP requests, in `.http`
files and saved to a chat.

## Copy from it when

Your app should appear where the person already is: they open a file of a kind it owns, read what
its tool did in the transcript, see a live number beside the composer, save something from a chat
message, or `@`-mention its items. For a screen with a tab, start from the template instead.

## What to read, in order

1. `.localix-mini-app/mini-app.json`: `fileAssociations` says which files the Store offers this app for.
2. `shared/http.ts`: the `.http` format as pure functions (parse, format, curl); every surface uses them.
3. `shared/model.ts`: the saved request, its schemas without defaults, and what the agent is told.
4. `backend/requests.ts`: a collection kept per chat (`scope: 'chat'`).
5. `backend/tools.ts`: tools that act on the chat the call runs in and return `details` for the card.
6. `backend/resources.ts`: the `@` provider; listing and expanding, scoped to the chat.
7. `backend/index.ts`: `createMiniApp(...).registration`, adding the provider.
8. `ui/register.tsx`: every host registration in one place, once per host.
9. `ui/HttpFileTab.tsx`, `ui/RequestPanel.tsx`, `ui/useFileRequests.ts`: the editor, built on the
   host's `FileTab` with a docked panel, reading the file as it changes on disk.
10. `ui/terminal.ts`: running a command in the chat's terminal (`miniAppTerminal.spawnCommand`).
11. `ui/ToolCard.tsx`: a transcript card from the kit's tool-card parts.
12. `ui/RequestsStrip.tsx`: a `composer.header` surface with a live count, mounted only when focused.
13. `ui/saveAction.ts`: a contextual action on a chat code block (`host.actions`).
14. `backend/index.test.ts`, `ui/register.test.tsx`, `ui/surfaces.dom.test.tsx`: one test per thing
    a person, the agent or the host does.
