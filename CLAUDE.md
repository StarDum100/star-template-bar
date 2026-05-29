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
- **Game settings** (scope `client`): `barHidden` (`config: true`) — whether the bar is hidden, toggled via Configure Game Settings or the Extra tab; `gridDerivedSize` (`config: false`, default false) — when on, newly created templates use one grid square as their minimum size, toggled only from the Extra tab. Both are persisted on the dialog's Save.

### Template placement flow

`placeTemplate()` / `pickNewPosition()` add a preview `MeasuredTemplate` object to `canvas.templates.preview`, then register `pointermove` (snap + refresh), `pointerdown` (commit), and `keydown Escape` (cancel) listeners on `window`. On commit, the preview is destroyed and `canvas.scene.createEmbeddedDocuments` writes the real template.

The `gridDist()` and `gridWidthScale()` helpers translate between Foundry's internal distance units and display feet. Non-module templates (placed outside this module) need different scaling applied via `templateToCreateData()`.

`minTemplateSize()` returns the floor applied to a newly created template in `placeTemplate()`: `MIN_TEMPLATE_SIZE` (1) normally, or one grid square (`canvas.scene.grid.distance`) when the `gridDerivedSize` setting is on (falling back to `MIN_TEMPLATE_SIZE` on a gridless scene). It also defines the "size unit" for the form's default dimensions: `buildTemplateFormHtml()` seeds the fields at one unit, and `wireTypeToggle()` resets them to the selected shape's defaults on every type change — circle/cone radius = 1 unit, rect = 1×1 units, ray = 1 unit wide × 5 units long (with the unit being 1ft, or one grid square when the toggle is on). It's only consulted at creation time, so existing templates keep their measurements when the toggle changes. The fixed `MIN_TEMPLATE_SIZE` floor still backs `readTemplateForm()` and `moduleDimsFromFlags()`.

`pickNewPosition()` (move preview) and `templateToCreateData()` (persisted create-data) share two pure, exported helpers for the module-flagged case: `hasModuleDims(f)` (the "does this template carry our dimension flags" guard) and `moduleDimsFromFlags(f, t)` (the `{ distance, width }` derivation — rect distance is the height×√2 diagonal). Each caller layers on its own `angle`/`direction` and non-module handling, which intentionally differ between the preview and create-data paths, so only the identical guard + dimension math is shared.

### Config dialog and deferred saves

`openConfig(bar, initialTab, resumeState)` manages all pending changes in local variables (`pendingCustom`, `pendingGrid`, `pendingRemovalOriginals`, `pendingMoveOriginals`, `pendingResetPosition`). Nothing is written to flags until the Save button fires. It owns the per-tab event wiring and delegates the dialog markup to `buildConfigContent(pendingCustom, barHidden, initialTab)` (which calls `renderTemplatesBody(pendingCustom)` for the Templates-tab rows).

The deferred create/delete bookkeeping is extracted into two exported async helpers:
- `commitMove(oldId, raw, newPos, pendingMoveOriginals)` — deletes the template at its old position, recreates it at `newPos`, and records the new copy's id → original data so Cancel can reverse it; on recreate failure it restores the original so a move can't lose the template.
- `rollbackCanceledChanges(pendingRemovalOriginals, pendingMoveOriginals)` — on Cancel, recreates each deleted template and reverses each move (delete the relocated copy, recreate the original); each step is isolated so one failure doesn't abort the rest.

Both are exported for direct unit testing (see the `commitMove / rollbackCanceledChanges` describe block in `tests/main.test.js`). The Move flow is re-entrant: clicking the move icon closes the dialog, calls `pickNewPosition()`, then reopens `openConfig` via `openConfig(bar, "move", resumeState)` passing all pending state through `resumeState` so nothing is lost between the two dialog sessions.

### CSS

All classes use the `stb-` prefix. The custom property `--stb-cols` is set inline on the grid element to drive `grid-template-columns` in CSS.

### Localization

- Every visible UI string is stored under the `STARTEMPLATEBAR` namespace in `localization/<lang>.json`, registered via the `languages` array in `module.json`. English (`localization/en.json`) is the source of truth. Shipped languages: English (`en`), French (`fr`), German (`de`), Spanish (`es`), Brazilian Portuguese (`pt-BR`).
- `translate(key, data)` is the in-module helper: it prefixes the key with `STARTEMPLATEBAR.` and calls `game.i18n.localize(key)` (no `data`) or `game.i18n.format(key, data)` (with `{placeholder}` interpolation). All UI text must go through `translate()` — do not hardcode user-facing strings. (The helper is named `translate`, not `t`, because `t` is used throughout the module as the variable for a template/shape type.)
- `notify(key, data)` wraps `ui.notifications.warn` and prefixes the localized message with `MODULE_TITLE`, producing e.g. `"Star Template Bar: <message>"`.
- The `barHidden` setting registers its `name`/`hint` as raw i18n keys (`STARTEMPLATEBAR.Settings.HideBar.*`); Foundry localizes those automatically when the settings menu renders.
- `MODULE_TITLE` (`"Star Template Bar"`) is the brand name and is intentionally **not** localized; it is interpolated into the dialog title and notification prefixes.
- Template shape types are stored by their lowercase value (`circle`/`cone`/`ray`/`rect`); the display label for each is localized under `Shape.<type>`. Units and symbols (`ft`, `&deg;`, `&times;`, `&mdash;`) are not localized.
- Translation values are trusted (shipped in-repo), but any value placed into an HTML attribute is still passed through `escapeHtml()` so a translation containing a quote can't break the markup.
- Adding a language: drop a `localization/<lang>.json` with the same nested keys, add an entry to `module.json` `languages`. `tests/localization.test.js` then enforces key/placeholder parity with English automatically.

## Test environment

`tests/main.test.js` sets up full jsdom mocks of Foundry globals (`Hooks`, `game`, `canvas`, `CONFIG`, `ui`, `foundry`) before `require("../scripts/main.js")`. The `Hooks.once` mock captures callbacks into a `hookCallbacks` map so tests invoke `init` and `ready` directly. The `game.i18n` mock loads the real `localization/en.json` and resolves keys through the same `localize`/`format` contract Foundry uses, so assertions check actual English text rather than raw keys.

`tests/localization.test.js` validates the language files: English is non-empty with string values, and any additional language has full key + `{placeholder}` parity with English. `tests/manifest.test.js` checks every declared `languages` path exists and parses as JSON nested under `STARTEMPLATEBAR`. `tests/encoding.test.js` guards the source and localization files against Windows-1252 double-encoding corruption.

`DialogV2.wait` is mocked to expose `__lastOptions` and `__lastInstance` so tests can call `options.render(...)` to wire up event handlers, then trigger buttons via `options.buttons[n].callback(...)`.

`flushAsync()` (`new Promise(r => setTimeout(r, 0))`) drains the microtask queue after async operations — one call is always enough because the mocked DB ops resolve synchronously.

When adding tests, follow the existing pattern: call the hook callback to initialize, use `openDialogHtml()` to render and wire a dialog, interact via jQuery on the returned `html`, and flush with `flushAsync()` before asserting.
