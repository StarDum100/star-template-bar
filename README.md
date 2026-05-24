# Star Template Placer

A FoundryVTT module that adds a draggable template bar to the UI, letting you place and manage measured templates on the game map with a single click. Supports one-off placement and saved custom templates for frequently used shapes.

## Features

- **Place button** — opens a dialog to configure shape, size, and color, then lets you click the map to place the template
- **Custom templates** — save named templates (e.g. "Fireball") that appear as bar buttons with a colored accent; click to place instantly
- **Remove button** — opens a list of all templates on the current scene so you can stage and delete them
- **Draggable bar** — drag the handle to reposition the bar anywhere on screen; position is saved per user
- **Hide bar** — option to hide the bar entirely; restore it via Configure Game Settings
- **All changes are deferred** — adding/removing custom templates, deleting placed templates, and resetting bar position only take effect when you click Save

## Compatibility

| Foundry Version | Status |
|---|---|
| v12 | Minimum |
| v13 | Verified |

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

Symlink or copy the module folder into your Foundry data directory:

```
<Foundry Data>/Data/modules/star-template-placer/
```

Then launch Foundry, enable the module in your world, and open the browser console (`F12`) to watch for errors. Verify:

- The template bar appears on screen and can be dragged to a new position
- Clicking **Place** opens the placement dialog; selecting a shape and clicking Place enters placement mode (crosshair cursor); clicking the map places the template
- Pressing Escape while in placement mode cancels without placing
- Clicking **Remove** opens the Remove tab; marking templates for removal and clicking Save deletes them from the scene
- Custom templates saved via the config dialog appear as bar buttons and place templates when clicked
- Changes cancelled via the Cancel button do not persist

### Running the automated test suite

```bash
npm test
```

The suite uses [Jest](https://jestjs.io/) with a jsdom environment to test the module without a running Foundry instance. It covers:

- **Bar structure** — the bar is appended to the body with the correct buttons and handle
- **Placement dialog** — shape, size, angle, and color inputs; cone angle row visibility; Place/Cancel flow
- **Custom templates** — add, delete, duplicate-name guard, and color accent on bar buttons
- **Deferred saves** — all config changes (custom templates, placed-template removals, bar position reset) are staged and only committed on Save; Cancel reverts them
- **Remove tab** — lists current scene templates, filters out pending removals on re-entry, and calls delete only on Save
- **Extra/Reset tabs** — hide-bar checkbox live preview; reset position live preview with revert on Cancel
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
   - `canvas.scene.templates.contents` — used to list templates in the Remove tab
   - `MeasuredTemplate#delete` — used to remove a template on Save
2. Run `npm test` to confirm the test suite still passes.
3. Install the module in a Foundry world running the new version and run through the manual steps above.
4. Update `compatibility.verified` in `module.json` once confirmed working.
