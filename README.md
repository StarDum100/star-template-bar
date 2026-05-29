# Star Template Bar

A FoundryVTT module that adds a draggable template bar to the UI, letting you place and manage measured templates on the game map with a single click. Supports one-off placement and saved custom templates for frequently used shapes.

## Features

- **Place button** — opens a dialog to configure shape, size, and color, then lets you click the map to place the template
- **Move button** — opens a dialog listing all placed templates; click the move icon to pick a template up and drop it somewhere new, or click the delete icon to remove it; all changes are deferred until Save
- **Configure button** — opens the full configure dialog with tabs for Templates, Move, Layout, Reset, and Extra
- **Custom templates** — save named templates (e.g. "Fireball") that appear as bar buttons with a colored accent; click to place instantly
- **Layout editor** — drag-and-drop grid for reordering bar buttons with a configurable row count
- **Draggable bar** — drag the handle to reposition the bar anywhere on screen; position is saved per user
- **Hide bar** — option to hide the bar entirely; restore it via Configure Game Settings
- **All changes are deferred** — adding/removing custom templates, moving/deleting placed templates, and resetting bar position only take effect when you click Save
- **Localized** — available in English, French, German, Spanish, and Brazilian Portuguese, following Foundry's selected language

## Compatibility

| Foundry Version | Status |
|---|---|
| v14 | Minimum |
| v14 | Verified |

## Installation

1. In Foundry, open **Add-on Modules** and click **Install Module**.
2. Paste the manifest URL into the field at the bottom and click **Install**.
3. Enable the module in your world under **Manage Modules**.

## Development

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or later)

### Setup

```bash
npm install
```

### Testing locally in Foundry

Create a junction from your Foundry modules directory to this repo so Foundry always reads live source files:

```cmd
mklink /J "%LOCALAPPDATA%\FoundryVTT\Data\modules\star-template-bar" "<path-to-project>"
```

Then launch Foundry, enable the module in your world, and open the browser console (`F12`) to watch for errors. Verify:

- The template bar appears on screen and can be dragged to a new position
- Clicking **Place** opens the placement dialog; selecting a shape and clicking Place enters placement mode (crosshair cursor); clicking the map places the template
- Pressing Escape while in placement mode cancels without placing
- Clicking **Move** opens the Move tab; clicking the move icon picks up a template and lets you drop it at a new position; clicking the delete icon removes a template; Cancel restores all changes
- Clicking the gear **Configure** button opens the full dialog; custom templates added on the Templates tab appear as bar buttons; the Layout tab lets you drag buttons to reorder them and change the row count
- Changes cancelled via the Cancel button do not persist

### Running the automated test suite

```bash
npm test
```

The suite uses [Jest](https://jestjs.io/) with a jsdom environment to test the module without a running Foundry instance. It covers:

- **Bar structure** — the bar is appended to the body with the correct buttons and handle
- **Placement dialog** — shape, size, angle, and color inputs; cone angle row visibility; Place/Cancel flow
- **Custom templates** — add, delete, duplicate-name guard, and color accent on bar buttons
- **Deferred saves** — all config changes (custom templates, placed-template moves/removals, bar position reset) are staged and only committed on Save; Cancel restores originals
- **Move tab** — lists current scene templates, supports moving a template to a new position or staging it for deletion; cancelled moves and deletions are restored on Cancel
- **Layout tab** — drag-and-drop reordering and row-count reshaping update the pending grid
- **Extra/Reset tabs** — hide-bar checkbox live preview; reset position live preview with revert on Cancel; Clear All Templates
- **XSS safety** — user-supplied names, owner names, and template IDs are HTML-escaped before rendering
- **Manifest validation** — `module.json` is well-formed, version strings are valid, and all referenced files exist on disk

### Verifying compatibility with a new Foundry version

When a new Foundry version is released:

1. Check the Foundry changelog for changes to any of the APIs this module depends on:
   - `Hooks.once` — used to register `init` and `ready` callbacks
   - `game.settings.register` / `game.settings.get` / `game.settings.set` — used for the hide-bar client setting
   - `game.user.getFlag` / `game.user.setFlag` / `game.user.unsetFlag` — used to persist custom templates and bar position
   - `foundry.applications.api.DialogV2.wait` — used for the Place and Configure dialogs
   - `CONFIG.MeasuredTemplate.documentClass` / `objectClass` — used to build the live preview template during placement
   - `canvas.scene.createEmbeddedDocuments("MeasuredTemplate", ...)` — used to commit a placed template
   - `canvas.scene.templates.contents` — used to list templates in the Move tab
   - `MeasuredTemplate#delete` — used to remove a template on Save
2. Run `npm test` to confirm the test suite still passes.
3. Install the module in a Foundry world running the new version and run through the manual steps above.
4. Update `compatibility.verified` in `module.json` once confirmed working.
