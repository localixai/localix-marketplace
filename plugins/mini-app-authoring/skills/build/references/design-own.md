Read this when the app has a character of its own (a game, a learning app, a media or reading app) and the Localix tool look would flatten it; for a tracker, table or dashboard read `design-localix.md`.

# Apps with their own look

## Contents

- What stays the host's
- Your own stylesheet
- Theme: light and dark
- Motion
- Drawing: canvas, SVG, charts
- Controls and the native-control waiver
- Not supported yet

An own look means an own **surface** (a board, a card, a stage, a reader page), not an own app shell. The frame around it stays the kit's: `PanelHeader`, buttons, dialogs, `StateNotice`, `TabBar`. The person moves between this app and the rest of Localix all day; only the thing they came to play, learn or read is yours. `examples/game/` is the bar; the real apps are `chess`, `checkers`, `battleship`, `snake`, `game-2048` (games), `learning` and `reader`.

## What stays the host's

| Keep | Why |
| --- | --- |
| Fonts (`font-sans`, `font-mono`) | the host loads them; shipping a font file with the app is not a tested path yet |
| Kit controls, dialogs, menus, toasts | focus ring, height, keyboard, theme |
| Words, number and date formatting | see `design-localix.md` |
| Keyboard ownership, `useFocusEntry`, `@container` fill chain | see `screens.md` |
| Status colours for status | a check mark is not your accent |

Own: the surface's colours, shapes, board geometry, pieces, illustrations, motion and sound-free feedback.

## Your own stylesheet

A `.css` file next to the component, imported by the UI. The host bundles it with the app; the style gate does not scan `.css`, so the discipline is yours.

```ts
// ui/css.d.ts (TypeScript checks side-effect imports, so tell it the specifier is a module)
declare module '*.css'
```

```tsx
import './board.css'
```

- **Prefix every class** with the app (`.chess-board`, `.chess-square`): the stylesheet shares one document with the host and other apps.
- **Size from the container, not the viewport**: make the surface an inline-size container and use `cqw` (`100cqw / 8` is one square). The pane may be narrow, split or full.
- Use `aspect-ratio`, `min()` and `clamp()`, not fixed pixel sizes. Check a 320 px pane.
- Keep layout structure in Tailwind classes on the element and the **look** in the stylesheet; do not mix both for one property.

## Theme: light and dark

The host marks the theme with `data-theme` on `:root` (`light` or `dark`). Dark is the default: the host's tokens are defined on `:root` and overridden under `[data-theme='light']`, so do the same with yours. Every host token is a CSS variable that already follows the theme.

- **Derive from host tokens** with `color-mix(in oklab, var(--foreground) 14%, transparent)`, `var(--chart-N)` for accents, `var(--status-error)` for danger. The result follows the theme with no extra rule.
- A colour that must be fixed (a piece, a suit, a tile palette) is `oklch(...)` and **defined twice**:

```css
.chess-board {
  --chess-fill: oklch(0.97 0.01 85);
}
[data-theme='light'] .chess-board {
  --chess-fill: oklch(0.32 0.02 85);
}
```

- Look at both themes before you finish; a board whose squares lost their contrast in one theme is no board.
- A chart or canvas library does not read CSS variables on its own. Read the colours with `getComputedStyle` and re-read when `useTheme()` (`@localixai/kit/theme`, `resolvedTheme`) changes; `trading` does this for its price chart.

## Motion

- Keyframes in the stylesheet, durations from the host scale where you can (`var(--dur-fast)`, `var(--ease-soft)`).
- **Always guard motion**: wrap decorative animation in `@media (prefers-reduced-motion: no-preference)` or ask `prefersReducedMotion()` (`@localixai/kit/platform`) and jump to the end state.
- A frame loop (`requestAnimationFrame`) starts only while the screen is visible (`useWorkItemVisible()`) and stops on unmount; read `prefersReducedMotion()` once per run. See `game-2048/ui/game/useTiles.ts`.
- Animate `transform` and `opacity`; never `top`/`left`/`width` per frame.
- State changes that matter (a win, an error) are also **text**, not only a flourish.

## Drawing: canvas, SVG, charts

| Need | Use |
| --- | --- |
| A grid of cells, a board | DOM or SVG, one element per cell, `role="grid"` when it is interactive |
| Many moving objects, particles | `<canvas>` with your own loop |
| A chart in the Localix style | `TrendChart`, `DistributionChart`, `ChartView` (see `design-localix.md`) |
| A chart the kit cannot draw (candles, heatmaps) | a charting library, bundled with the app (`bun add`), its colours read from the theme as above |
| A node graph or whiteboard | the kit canvas, never your own (`canvas.md`) |

Draw the model from `shared/`: the screen renders state and sends moves; legality and scoring live in pure functions the tests and the agent's tools share.

## Controls and the native-control waiver

Buttons, inputs and selects are the kit's, even in a styled app. A **bare hit target** (a board square, a card, a tile) may be a native `<button>`; the style gate asks for a reason on the same line or the line above:

```tsx
<button // mini-app: native-control — a board square is a bare hit target; a kit Button would draw a control over the board
  className="chess-square"
  aria-label={`${file}${rank}`}
  onClick={() => select(square)}
/>
```

Give every such target an `aria-label` and a visible focus state of your own (`:focus-visible` with a ring from `var(--ring)` or `var(--chart-2)`). The waiver covers one kind of element, not a licence for a styled form.

## Not supported yet

- Your own font files and sound files: nothing in the host forbids them, but no build step or check covers shipping one, so the result is untested. Use the host fonts and silent feedback until it is.
- Reading `prefers-color-scheme` as the theme: the app follows `data-theme`, which can differ from the system setting.
- Full-bleed screens that hide the host's pane chrome.

Build within the pane; if a design needs one of these, say so in the report instead of working around it.
