# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm test                          # run all tests
npx jest tests/main.test.js       # run one test file
npx jest -t "description text"    # run tests matching a name pattern
```

There is no build step. Foundry loads `scripts/main.js` directly as a classic script.

## Architecture

### Single-file module

All logic lives in `scripts/main.js`, wrapped in an IIFE. The IIFE is required because multiple star-* modules are loaded together in Foundry's global scope and each declares `const MODULE_ID`; without isolation this throws a redeclaration error.

### Persistent state

State is stored in two places:

- **`game.user` flags** (`MODULE_ID` namespace): `customTemplates` (array of template objects), `barGrid` (array of string arrays — the button layout grid), `barPosition` ({left, top})
- **Game setting** (`barHidden`, scope `client`): whether the bar is hidden; toggled via Configure Game Settings or the Extra tab

### Template placement flow

`placeTemplate()` / `pickNewPosition()` add a preview `MeasuredTemplate` object to `canvas.templates.preview`, then register `pointermove` (snap + refresh), `pointerdown` (commit), and `keydown Escape` (cancel) listeners on `window`. On commit, the preview is destroyed and `canvas.scene.createEmbeddedDocuments` writes the real template.

The `gridDist()` and `gridWidthScale()` helpers translate between Foundry's internal distance units and display feet. Non-module templates (placed outside this module) need different scaling applied via `templateToCreateData()`.

### Config dialog and deferred saves

`openConfig(bar, initialTab, resumeState)` manages all pending changes in local variables (`pendingCustom`, `pendingGrid`, `pendingRemovalOriginals`, `pendingMoveOriginals`, `pendingResetPosition`). Nothing is written to flags until the Save button fires. Cancel restores deleted/moved templates by calling `createEmbeddedDocuments` with their original data.

The Move flow is re-entrant: clicking the move icon closes the dialog, calls `pickNewPosition()`, then reopens `openConfig` via `openConfig(bar, "move", resumeState)` passing all pending state through `resumeState` so nothing is lost between the two dialog sessions.

### CSS

All classes use the `stb-` prefix. The custom property `--stb-cols` is set inline on the grid element to drive `grid-template-columns` in CSS.

## Test environment

`tests/main.test.js` sets up full jsdom mocks of Foundry globals (`Hooks`, `game`, `canvas`, `CONFIG`, `ui`, `foundry`) before `require("../scripts/main.js")`. The `Hooks.once` mock captures callbacks into a `hookCallbacks` map so tests invoke `init` and `ready` directly.

`DialogV2.wait` is mocked to expose `__lastOptions` and `__lastInstance` so tests can call `options.render(...)` to wire up event handlers, then trigger buttons via `options.buttons[n].callback(...)`.

`flushAsync()` (`new Promise(r => setTimeout(r, 0))`) drains the microtask queue after async operations — one call is always enough because the mocked DB ops resolve synchronously.

When adding tests, follow the existing pattern: call the hook callback to initialize, use `openDialogHtml()` to render and wire a dialog, interact via jQuery on the returned `html`, and flush with `flushAsync()` before asserting.
