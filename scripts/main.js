(function () {
const MODULE_ID = "star-template-placer";
const MODULE_TITLE = "Star Template Placer";

let configOpen = false;

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

const TEMPLATE_TYPES = ["circle", "cone", "ray", "rect"];

function getCustomTemplates() {
    return game.user.getFlag(MODULE_ID, "customTemplates") ?? [];
}

function getBarGrid(customTemplates = getCustomTemplates()) {
    const saved = game.user.getFlag(MODULE_ID, "barGrid");
    if (saved?.length) return saved;
    return [customTemplates.map(t => t.name)];
}

async function placeTemplate({ t, distance, angle, width, height, fillColor, name }) {
    if (!canvas?.scene) {
        ui.notifications.warn(`${MODULE_TITLE}: No active scene.`);
        return;
    }

    const effectiveDistance = (t === "rect") ? (height ?? width) * Math.SQRT2 : distance;

    return new Promise((resolve) => {
        const { x: startX, y: startY } = canvas.mousePosition;
        const prevCursor = document.body.style.cursor;
        document.body.style.cursor = "crosshair";

        const doc = new CONFIG.MeasuredTemplate.documentClass({
            t,
            x:         startX,
            y:         startY,
            distance:  Math.max(5, effectiveDistance),
            angle:     angle ?? 53.13,
            width:     Math.max(5, width ?? distance),
            direction: t === "rect" ? 45 : 0,
            fillColor,
            borderColor: fillColor,
            user: game.user.id,
        }, { parent: canvas.scene });

        const template = new CONFIG.MeasuredTemplate.objectClass(doc);
        canvas.templates.preview.addChild(template);
        template.draw?.().catch?.(() => {});

        const cleanup = () => {
            canvas.templates.preview.removeChild(template);
            template.destroy?.({ children: true });
            canvas.app.view.removeEventListener("pointermove", onMove);
            canvas.app.view.removeEventListener("pointerdown", onPlace);
            window.removeEventListener("keydown", onCancel);
            document.body.style.cursor = prevCursor;
        };

        const onMove = () => {
            const { x, y } = canvas.mousePosition;
            const snapped  = canvas.grid?.getSnappedPosition?.(x, y) ?? { x, y };
            template.document.updateSource({ x: snapped.x, y: snapped.y });
            template.refresh?.();
        };

        const onPlace = async () => {
            cleanup();
            const { x: rawX, y: rawY } = canvas.mousePosition;
            const { x, y } = canvas.grid?.getSnappedPosition?.(rawX, rawY) ?? { x: rawX, y: rawY };
            await canvas.scene.createEmbeddedDocuments("MeasuredTemplate", [{
                t, x, y,
                distance:  Math.max(5, effectiveDistance),
                angle:     angle ?? 53.13,
                width:     Math.max(5, width ?? distance),
                direction: t === "rect" ? 45 : 0,
                fillColor,
                borderColor: fillColor,
                user: game.user.id,
                flags: {
                    [MODULE_ID]: {
                        ...(name ? { name } : {}),
                        ...(distance != null ? { distance } : {}),
                        ...(angle    != null ? { angle }    : {}),
                        ...(width    != null ? { width }    : {}),
                        ...(height   != null ? { height }   : {}),
                    }
                },
            }]);
            resolve();
        };

        const onCancel = (e) => {
            if (e.key !== "Escape") return;
            cleanup();
            resolve();
        };

        canvas.app.view.addEventListener("pointermove", onMove);
        canvas.app.view.addEventListener("pointerdown", onPlace);
        window.addEventListener("keydown", onCancel);
    });
}

async function pickNewPosition(templateData) {
    if (!canvas?.scene) return null;

    return new Promise((resolve) => {
        const prevCursor = document.body.style.cursor;
        document.body.style.cursor = "crosshair";

        const { _id, x: _x, y: _y, user: _user, ...baseData } = templateData;
        const { t } = baseData;
        const f = templateData.flags?.[MODULE_ID] ?? {};
        const { x: startX, y: startY } = canvas.mousePosition;

        let overrides = {};
        if (f.distance != null || f.width != null || f.height != null) {
            const fd = f.distance ?? 20;
            const fw = f.width    ?? fd;
            const fh = f.height;
            overrides = {
                distance:  t === "rect" ? (fh ?? fw) * Math.SQRT2 : Math.max(5, fd),
                angle:     f.angle ?? 53.13,
                width:     Math.max(5, fw ?? fd),
                direction: t === "rect" ? 45 : 0,
            };
        }

        const doc = new CONFIG.MeasuredTemplate.documentClass({
            ...baseData,
            ...overrides,
            x:    startX,
            y:    startY,
            user: game.user.id,
        }, { parent: canvas.scene });

        const template = new CONFIG.MeasuredTemplate.objectClass(doc);
        canvas.templates.preview.addChild(template);
        template.draw?.().catch?.(() => {});

        const cleanup = () => {
            canvas.templates.preview.removeChild(template);
            template.destroy?.({ children: true });
            canvas.app.view.removeEventListener("pointermove", onMove);
            canvas.app.view.removeEventListener("pointerdown", onPlace);
            window.removeEventListener("keydown", onCancel);
            document.body.style.cursor = prevCursor;
        };

        const onMove = () => {
            const { x, y } = canvas.mousePosition;
            const snapped  = canvas.grid?.getSnappedPosition?.(x, y) ?? { x, y };
            template.document.updateSource({ x: snapped.x, y: snapped.y });
            template.refresh?.();
        };

        const onPlace = () => {
            cleanup();
            const { x: rawX, y: rawY } = canvas.mousePosition;
            const { x, y } = canvas.grid?.getSnappedPosition?.(rawX, rawY) ?? { x: rawX, y: rawY };
            resolve({ x, y });
        };

        const onCancel = (e) => {
            if (e.key !== "Escape") return;
            cleanup();
            resolve(null);
        };

        canvas.app.view.addEventListener("pointermove", onMove);
        canvas.app.view.addEventListener("pointerdown", onPlace);
        window.addEventListener("keydown", onCancel);
    });
}

function templateOwnerName(t) {
    return t.author?.name ?? game.users?.get(t.user)?.name ?? "Unknown";
}

function templateDistanceFt(t) {
    const gridDistance = canvas?.scene?.grid?.distance ?? 1;
    return Math.round(t.distance * gridDistance);
}

function buildMoveContent(templates, pendingMoveOriginals) {
    const gridDistance = canvas?.scene?.grid?.distance ?? 1;
    const rows = templates.map(t => {
        const f         = t.flags?.[MODULE_ID] ?? {};
        const name      = escapeHtml(String(f.name ?? ""));
        const owner     = escapeHtml(templateOwnerName(t));
        const safeColor = escapeHtml(String(t.fillColor ?? "#000000"));
        const angleCell = t.t === "cone" ? `${f.angle ?? t.angle ?? 53.13}°` : "—";
        let distCell;
        if (t.t === "rect") {
            distCell = (f.width != null && f.height != null) ? `${f.width}ft × ${f.height}ft` : "—";
        } else if (t.t === "ray") {
            const rayDist  = f.distance != null ? `${f.distance}` : `${templateDistanceFt(t)}`;
            const rayWidth = f.width    != null ? `${f.width}`    : `${Math.round((t.width ?? 0) * gridDistance)}`;
            distCell = `${rayDist}ft × ${rayWidth}ft`;
        } else {
            distCell = f.distance != null ? `${f.distance}ft` : `${templateDistanceFt(t)}ft`;
        }
        const moved = pendingMoveOriginals.has(t.id);
        return `
            <tr data-id="${escapeHtml(t.id)}"${moved ? ' class="stp-pending-move"' : ''}>
                <td>${name}</td>
                <td>${owner}</td>
                <td>${escapeHtml(t.t)}</td>
                <td>${distCell}</td>
                <td>${angleCell}</td>
                <td><span class="stp-color-swatch" style="background:${safeColor}"></span></td>
                <td class="stp-action-cell">
                    <button type="button" class="stp-move-template-btn" title="Pick up and move this template">&#9999;</button>
                    <button type="button" class="stp-remove-template-btn" title="Delete this template">&#10005;</button>
                </td>
            </tr>
        `;
    }).join("");
    return `
        <table class="stp-config-table">
            <thead><tr><th>Name</th><th>Owner</th><th>Shape</th><th>Size</th><th>Angle</th><th>Color</th><th></th></tr></thead>
            <tbody>${rows}</tbody>
        </table>
    `;
}

function applyBarPosition(bar, savedPos = game.user.getFlag(MODULE_ID, "barPosition")) {
    const pos = savedPos ?? {
        left: Math.round((window.innerWidth - bar.outerWidth()) / 2),
        top: 10,
    };
    const left = Math.max(0, Math.min(window.innerWidth  - bar.outerWidth(),  pos.left));
    const top  = Math.max(0, Math.min(window.innerHeight - bar.outerHeight(), pos.top));
    bar.css({ left, top });
}

function initBarDrag(bar) {
    let startX, startY, startLeft, startTop;
    bar.find(".stp-bar-handle").on("mousedown", (e) => {
        e.preventDefault();
        startX    = e.clientX;
        startY    = e.clientY;
        startLeft = parseInt(bar.css("left")) || 0;
        startTop  = parseInt(bar.css("top"))  || 0;

        $(document).on("mousemove.stp-drag", (e) => {
            const left = Math.max(0, Math.min(window.innerWidth  - bar.outerWidth(),  startLeft + e.clientX - startX));
            const top  = Math.max(0, Math.min(window.innerHeight - bar.outerHeight(), startTop  + e.clientY - startY));
            bar.css({ left, top });
        });

        $(document).on("mouseup.stp-drag", () => {
            $(document).off("mousemove.stp-drag mouseup.stp-drag");
            game.user.setFlag(MODULE_ID, "barPosition", {
                left: parseInt(bar.css("left")),
                top:  parseInt(bar.css("top")),
            });
        });
    });
}

function renderCustomButtons(bar, overrides = {}) {
    const customTemplates = overrides.customTemplates ?? getCustomTemplates();
    const grid            = overrides.grid            ?? getBarGrid(customTemplates);
    const knownNames      = new Set(customTemplates.map(t => t.name));
    const byName          = Object.fromEntries(customTemplates.map(t => [t.name, t]));

    const gridEl  = bar.find(".stp-custom-grid");
    gridEl.empty();

    const multirow = grid.length > 1;
    bar.toggleClass("stp-bar-multirow", multirow);
    if (multirow) {
        const maxCols = Math.max(...grid.map(r => r.length));
        gridEl.css("--stp-cols", maxCols);
    } else {
        gridEl.css("--stp-cols", "");
    }

    for (const row of grid) {
        const rowEl = $('<div class="stp-bar-row">');
        for (const name of row) {
            if (!knownNames.has(name)) continue;
            const tpl = byName[name];
            const btn = $("<button>")
                .addClass("stp-custom-btn")
                .attr("title", `${tpl.name} (${tpl.t}, ${tpl.distance}ft)`)
                .text(tpl.name);
            btn.css("border-left", `3px solid ${tpl.fillColor}`);
            btn.on("click", () => placeTemplate(tpl));
            rowEl.append(btn);
        }
        gridEl.append(rowEl);
    }
}

function makeCustomRow(tpl, index) {
    const safeName  = escapeHtml(tpl.name);
    const safeType  = escapeHtml(tpl.t);
    const safeColor = escapeHtml(tpl.fillColor);
    const widthCell = tpl.t === "ray"  ? `${tpl.width ?? 5}ft`
                   : tpl.t === "rect" ? `${tpl.width ?? 5}ft × ${tpl.height ?? 5}ft`
                   : "—";
    const angleCell = tpl.t === "cone" ? `${tpl.angle ?? 53.13}°` : "—";
    return `
        <tr data-index="${index}">
            <td>${safeName}</td>
            <td>${safeType}</td>
            <td>${tpl.t === "rect" ? "—" : `${escapeHtml(String(tpl.distance))}ft`}</td>
            <td>${widthCell}</td>
            <td>${angleCell}</td>
            <td><span class="stp-color-swatch" style="background:${safeColor}"></span></td>
            <td class="stp-delete-cell"><button type="button" class="stp-delete-btn">&#10005;</button></td>
        </tr>
    `;
}

function renderLayoutEditor(html, pendingGrid, pendingCustom) {
    const panel = html.find('[data-panel="layout"]');
    panel.empty();

    const knownNames = new Set(pendingCustom.map(t => t.name));
    const flat = pendingGrid.flat().filter(name => knownNames.has(name));

    if (flat.length === 0) {
        panel.append('<p class="stp-layout-empty">No custom templates configured. Add templates on the Templates tab.</p>');
        return;
    }

    const numRows = pendingGrid.length || 1;
    const numCols = Math.ceil(flat.length / numRows);

    panel.append('<p class="stp-layout-hint">Drag any template to a slot to reorder &middot; Change the row count to reorganize the grid</p>');

    const controls = $('<div class="stp-layout-controls">');
    const rowInput  = $('<input type="number" class="stp-rows-input">')
        .attr("min", 1).attr("max", flat.length).val(numRows);
    controls.append($('<label class="stp-rows-label">').text("Number of Rows: ").append(rowInput));
    panel.append(controls);

    const editor = $('<div class="stp-layout-editor">');
    for (let r = 0; r < numRows; r++) {
        const rowEl = $('<div class="stp-layout-row">');
        for (let c = 0; c < numCols; c++) {
            const idx = r * numCols + c;
            if (idx < flat.length) {
                rowEl.append(
                    $('<div class="stp-layout-tile" draggable="true">')
                        .attr("data-index", idx)
                        .text(flat[idx])
                );
            } else {
                rowEl.append($('<div class="stp-layout-slot">').attr("data-index", idx));
            }
        }
        editor.append(rowEl);
    }
    panel.append(editor);
}

function reshapeGrid(pendingGrid, numRows, flat = pendingGrid.flat()) {
    const numCols = Math.ceil(flat.length / numRows);
    pendingGrid.splice(0);
    for (let r = 0; r < numRows; r++) {
        const row = flat.slice(r * numCols, (r + 1) * numCols);
        if (row.length > 0) pendingGrid.push(row);
    }
}

async function openPlaceDialog() {
    const typeOptions = TEMPLATE_TYPES.map(t =>
        `<option value="${t}">${t.charAt(0).toUpperCase() + t.slice(1)}</option>`
    ).join("");

    const rawColor = game.user.color?.css ?? game.user.color ?? "";
    const defaultColor = /^#[0-9a-fA-F]{6}$/.test(rawColor) ? rawColor : "#ff0000";

    const content = `
        <div class="stp-place-form">
            <div class="stp-form-row">
                <label>Shape</label>
                <select class="stp-type-select">${typeOptions}</select>
            </div>
            <div class="stp-form-row stp-distance-row">
                <label>Size (ft)</label>
                <input type="number" class="stp-distance-input" value="20" min="5" step="5">
            </div>
            <div class="stp-form-row stp-cone-row" style="display:none">
                <label>Angle (&deg;)</label>
                <input type="number" class="stp-angle-input" value="53.13" min="1" max="360">
            </div>
            <div class="stp-form-row stp-width-row" style="display:none">
                <label>Width (ft)</label>
                <input type="number" class="stp-width-input" value="5" min="5" step="5">
            </div>
            <div class="stp-form-row stp-height-row" style="display:none">
                <label>Height (ft)</label>
                <input type="number" class="stp-height-input" value="20" min="5" step="5">
            </div>
            <div class="stp-form-row">
                <label>Color</label>
                <input type="color" class="stp-color-input" value="${escapeHtml(defaultColor)}">
            </div>
        </div>
    `;

    let templateConfig = null;

    await foundry.applications.api.DialogV2.wait({
        window:      { title: "Place Template" },
        content,
        rejectClose: false,
        buttons: [
            {
                action: "place",
                label: "Place",
                callback: (event, button, dialog) => {
                    const $html     = $(dialog.element);
                    const t         = $html.find(".stp-type-select").val();
                    const distance  = Math.max(5, parseFloat($html.find(".stp-distance-input").val()) || 20);
                    const angle     = parseFloat($html.find(".stp-angle-input").val()) || 53.13;
                    const width     = Math.max(5, parseFloat($html.find(".stp-width-input").val()) || 5);
                    const height    = Math.max(5, parseFloat($html.find(".stp-height-input").val()) || 20);
                    const fillColor = $html.find(".stp-color-input").val();
                    templateConfig  = { t, distance, angle, width, height, fillColor };
                }
            },
            { action: "cancel", label: "Cancel", default: true }
        ],
        render: (event, dialog) => {
            const $html = $(dialog.element);
            $html.on("change", ".stp-type-select", (e) => {
                const type = e.target.value;
                $html.find(".stp-cone-row").toggle(type === "cone");
                $html.find(".stp-width-row").toggle(type === "ray" || type === "rect");
                $html.find(".stp-height-row").toggle(type === "rect");
                $html.find(".stp-distance-row").toggle(type !== "rect");
            });
        }
    });

    if (templateConfig) {
        await placeTemplate(templateConfig);
    }
}

async function openConfig(bar, initialTab = "templates", resumeState = null) {
    const barHidden     = game.settings.get(MODULE_ID, "barHidden");
    const pendingCustom = resumeState?.pendingCustom ?? [...getCustomTemplates()];
    const pendingGrid   = resumeState?.pendingGrid   ?? getBarGrid(pendingCustom).map(row => [...row]);

    let saved                = false;
    let pendingResetPosition = resumeState?.pendingResetPosition ?? false;
    let originalPosition     = resumeState?.originalPosition     ?? null;
    const pendingRemovals         = resumeState?.pendingRemovals         ?? [];
    const pendingRemovalOriginals = resumeState?.pendingRemovalOriginals ?? new Map();
    const pendingMoveOriginals     = resumeState?.pendingMoveOriginals     ?? new Map();

    let moveRequested = null;

    const typeOptions = TEMPLATE_TYPES.map(t =>
        `<option value="${t}">${t.charAt(0).toUpperCase() + t.slice(1)}</option>`
    ).join("");

    const tab   = (name) => `stp-tab${name === initialTab ? " stp-tab-active" : ""}`;
    const panel = (name) => `stp-tab-panel${name === initialTab ? "" : " stp-tab-panel-hidden"}`;

    const renderTemplatesBody = () => pendingCustom.length === 0
        ? '<tr class="stp-no-custom-row"><td colspan="7">No custom templates saved.</td></tr>'
        : pendingCustom.map((tpl, i) => makeCustomRow(tpl, i)).join("");

    const content = `
        <div class="stp-tabs">
            <button type="button" class="${tab("templates")}" data-tab="templates">Templates</button>
            <button type="button" class="${tab("move")}"      data-tab="move">Move</button>
            <button type="button" class="${tab("layout")}"    data-tab="layout">Layout</button>
            <button type="button" class="${tab("reset")}"     data-tab="reset">Reset</button>
            <button type="button" class="${tab("extra")}"     data-tab="extra">Extra</button>
        </div>
        <div class="${panel("templates")}" data-panel="templates">
            <table class="stp-config-table">
                <thead>
                    <tr><th>Name</th><th>Shape</th><th>Size</th><th>Width</th><th>Angle</th><th>Color</th><th></th></tr>
                </thead>
                <tbody>
                    ${renderTemplatesBody()}
                </tbody>
            </table>
            <div class="stp-add-section">
                <div class="stp-add-form">
                    <div class="stp-form-row">
                        <label>Name</label>
                        <input type="text" class="stp-new-name" placeholder="e.g. Fireball">
                    </div>
                    <div class="stp-form-row">
                        <label>Shape</label>
                        <select class="stp-new-type">${typeOptions}</select>
                    </div>
                    <div class="stp-form-row stp-new-distance-row">
                        <label>Size (ft)</label>
                        <input type="number" class="stp-new-distance" value="20" min="5" step="5">
                    </div>
                    <div class="stp-form-row stp-new-cone-row" style="display:none">
                        <label>Angle (&deg;)</label>
                        <input type="number" class="stp-new-angle" value="53.13" min="1" max="360">
                    </div>
                    <div class="stp-form-row stp-new-width-row" style="display:none">
                        <label>Width (ft)</label>
                        <input type="number" class="stp-new-width" value="5" min="5" step="5">
                    </div>
                    <div class="stp-form-row stp-new-height-row" style="display:none">
                        <label>Height (ft)</label>
                        <input type="number" class="stp-new-height" value="20" min="5" step="5">
                    </div>
                    <div class="stp-form-row">
                        <label>Color</label>
                        <input type="color" class="stp-new-color" value="#ff0000">
                    </div>
                    <button type="button" class="stp-add-btn">Add Template</button>
                </div>
            </div>
        </div>
        <div class="${panel("layout")}" data-panel="layout"></div>
        <div class="${panel("move")}" data-panel="move"></div>
        <div class="${panel("extra")}" data-panel="extra">
            <div class="stp-extra-panel">
                <label class="stp-extra-item">
                    <input type="checkbox" class="stp-hide-bar-checkbox"${barHidden ? " checked" : ""}>
                    <div>
                        <strong>Hide Button Bar</strong>
                        <p>Hide the button bar from the screen.</p>
                        <p>To restore it, uncheck this option in Configure Game Settings.</p>
                    </div>
                </label>
            </div>
        </div>
        <div class="${panel("reset")}" data-panel="reset">
            <div class="stp-reset-panel">
                <div class="stp-reset-item">
                    <div>
                        <strong>Reset Bar Position</strong>
                        <p>Move the button bar to the default position at the top center of the screen.</p>
                    </div>
                    <button type="button" class="stp-reset-position-btn">Reset Position</button>
                </div>
            </div>
        </div>
    `;

    await foundry.applications.api.DialogV2.wait({
        window:      { title: "Star Template Placer — Configure (save to persist changes)" },
        content,
        rejectClose: false,
        buttons: [
            {
                action: "save",
                label: "Save",
                callback: async (event, button, dialog) => {
                    saved = true;
                    const $html = $(dialog.element);
                    await game.user.setFlag(MODULE_ID, "customTemplates", pendingCustom);
                    await game.user.setFlag(MODULE_ID, "barGrid", pendingGrid);
                    for (const id of pendingRemovals) {
                        const tpl = canvas?.scene?.templates?.get(id);
                        if (tpl) await tpl.delete();
                    }
                    if (pendingResetPosition) {
                        await game.user.unsetFlag(MODULE_ID, "barPosition");
                    }
                    const newBarHidden = $html.find(".stp-hide-bar-checkbox").prop("checked");
                    await game.settings.set(MODULE_ID, "barHidden", newBarHidden);
                    if (newBarHidden) bar.hide();
                    else             bar.show();
                    renderCustomButtons(bar, { customTemplates: pendingCustom, grid: pendingGrid });
                }
            },
            { action: "cancel", label: "Cancel", default: true }
        ],
        render: (event, dialog) => {
            const $html = $(dialog.element);

            function renderMoveTab() {
                const movePanelEl = $html.find('[data-panel="move"]');
                const templates = (canvas?.scene?.templates?.contents ?? [])
                    .filter(t => !pendingRemovals.includes(t.id));
                if (templates.length === 0) {
                    movePanelEl.html('<p class="stp-move-empty">No templates on the map.</p>');
                } else {
                    movePanelEl.html(buildMoveContent(templates, pendingMoveOriginals));
                }
            }

            // Tab switching
            $html.on("click", ".stp-tab", (e) => {
                const tabName = e.currentTarget.dataset.tab;
                $html.find(".stp-tab").removeClass("stp-tab-active");
                $(e.currentTarget).addClass("stp-tab-active");
                $html.find(".stp-tab-panel").addClass("stp-tab-panel-hidden");
                $html.find(`[data-panel="${tabName}"]`).removeClass("stp-tab-panel-hidden");
                if (tabName === "move")   renderMoveTab();
                if (tabName === "layout") renderLayoutEditor($html, pendingGrid, pendingCustom);
            });

            // Type toggle in add form
            $html.on("change", ".stp-new-type", (e) => {
                const type = e.target.value;
                $html.find(".stp-new-cone-row").toggle(type === "cone");
                $html.find(".stp-new-width-row").toggle(type === "rect" || type === "ray");
                $html.find(".stp-new-height-row").toggle(type === "rect");
                $html.find(".stp-new-distance-row").toggle(type !== "rect");
            });

            // Delete a custom template row
            $html.on("click", ".stp-delete-btn", (e) => {
                const index = parseInt($(e.currentTarget).closest("tr").data("index"));
                const name  = pendingCustom[index].name;
                pendingCustom.splice(index, 1);
                for (let r = 0; r < pendingGrid.length; r++) {
                    const idx = pendingGrid[r].indexOf(name);
                    if (idx !== -1) {
                        pendingGrid[r].splice(idx, 1);
                        if (pendingGrid[r].length === 0) pendingGrid.splice(r, 1);
                        break;
                    }
                }
                $html.find('[data-panel="templates"] tbody').html(renderTemplatesBody());
            });

            // Add a custom template
            $html.on("click", ".stp-add-btn", () => {
                const name = $html.find(".stp-new-name").val().trim();
                if (!name) {
                    ui.notifications.warn(`${MODULE_TITLE}: Template name is required.`);
                    return;
                }
                if (pendingCustom.some(t => t.name === name)) {
                    ui.notifications.warn(`${MODULE_TITLE}: A template named "${escapeHtml(name)}" already exists.`);
                    return;
                }
                const t         = $html.find(".stp-new-type").val();
                const distance  = Math.max(5, parseFloat($html.find(".stp-new-distance").val()) || 20);
                const angle     = parseFloat($html.find(".stp-new-angle").val()) || 53.13;
                const width     = Math.max(5, parseFloat($html.find(".stp-new-width").val()) || 5);
                const height    = Math.max(5, parseFloat($html.find(".stp-new-height").val()) || 20);
                const fillColor = $html.find(".stp-new-color").val();
                pendingCustom.push({ name, t, distance, angle, width, height, fillColor });
                if (pendingGrid.length === 0) pendingGrid.push([name]);
                else pendingGrid[pendingGrid.length - 1].push(name);
                $html.find('[data-panel="templates"] tbody').html(renderTemplatesBody());
                $html.find(".stp-new-name").val("").focus();
            });

            $html.on("keydown", ".stp-new-name", (e) => {
                if (e.key === "Enter") $html.find(".stp-add-btn").trigger("click");
            });

            // Move tab: hide template as preview; actually deleted on Save, restored on Cancel
            $html.on("click", ".stp-remove-template-btn", async (e) => {
                const row = $(e.currentTarget).closest("tr");
                const id  = row.attr("data-id");
                pendingRemovals.push(id);
                const stagedTpl = canvas?.scene?.templates?.get(id);
                if (stagedTpl) {
                    pendingRemovalOriginals.set(id, stagedTpl.hidden ?? false);
                    await stagedTpl.update({ hidden: true });
                }
                row.remove();
                if ($html.find('[data-panel="move"] tbody tr[data-id]').length === 0) {
                    $html.find('[data-panel="move"]').html('<p class="stp-move-empty">No templates on the map.</p>');
                }
            });

            // Move tab: pick up a template and reposition it
            $html.on("click", ".stp-move-template-btn", (e) => {
                const id  = $(e.currentTarget).closest("tr").attr("data-id");
                const tpl = canvas?.scene?.templates?.get(id);
                if (!tpl) return;
                moveRequested = id;
                dialog.close();
            });

            // Layout tab: drag-and-drop
            let dragIndex = -1;

            $html.on("dragstart", ".stp-layout-tile", (e) => {
                dragIndex = parseInt($(e.currentTarget).data("index"));
                e.originalEvent.dataTransfer.effectAllowed = "move";
                setTimeout(() => $(e.currentTarget).addClass("stp-dragging"), 0);
            });

            $html.on("dragend", ".stp-layout-tile", () => {
                $html.find(".stp-layout-tile, .stp-layout-slot").removeClass("stp-dragging stp-slot-over");
                dragIndex = -1;
            });

            $html.on("dragover", ".stp-layout-tile, .stp-layout-slot", (e) => {
                const idx = parseInt($(e.currentTarget).data("index"));
                if (dragIndex === -1 || idx === dragIndex) return;
                e.preventDefault();
                $html.find(".stp-layout-tile, .stp-layout-slot").removeClass("stp-slot-over");
                $(e.currentTarget).addClass("stp-slot-over");
            });

            $html.on("dragleave", ".stp-layout-tile, .stp-layout-slot", (e) => {
                $(e.currentTarget).removeClass("stp-slot-over");
            });

            $html.on("drop", ".stp-layout-tile, .stp-layout-slot", (e) => {
                e.preventDefault();
                const tgtIdx = parseInt($(e.currentTarget).data("index"));
                const srcIdx = dragIndex;
                dragIndex = -1;
                if (srcIdx === -1 || tgtIdx === srcIdx) return;

                const flat = pendingGrid.flat();
                const name = flat[srcIdx];
                flat.splice(srcIdx, 1);
                const adjusted = srcIdx < tgtIdx ? tgtIdx - 1 : tgtIdx;
                flat.splice(Math.min(adjusted, flat.length), 0, name);

                reshapeGrid(pendingGrid, pendingGrid.length, flat);
                renderLayoutEditor($html, pendingGrid, pendingCustom);
            });

            $html.on("change", ".stp-rows-input", (e) => {
                const flat = pendingGrid.flat();
                let n = parseInt(e.target.value);
                if (isNaN(n) || n < 1) n = 1;
                if (n > flat.length) n = flat.length;
                $(e.target).val(n);
                reshapeGrid(pendingGrid, n, flat);
                renderLayoutEditor($html, pendingGrid, pendingCustom);
            });

            // Extra tab: live preview hide/show
            $html.on("change", ".stp-hide-bar-checkbox", (e) => {
                if (e.target.checked) bar.hide();
                else                  bar.show();
            });

            // Reset tab: live preview position reset
            $html.on("click", ".stp-reset-position-btn", () => {
                if (!pendingResetPosition) {
                    originalPosition = {
                        left: parseInt(bar.css("left")),
                        top:  parseInt(bar.css("top")),
                    };
                }
                pendingResetPosition = true;
                applyBarPosition(bar, null);
            });

            if (initialTab === "move")   renderMoveTab();
            if (initialTab === "layout") renderLayoutEditor($html, pendingGrid, pendingCustom);
        }
    });

    if (moveRequested) {
        const tpl = canvas?.scene?.templates?.get(moveRequested);
        if (tpl) {
            const origX = tpl.x;
            const origY = tpl.y;
            const newPos = await pickNewPosition(tpl.toObject());
            if (newPos) {
                if (!pendingMoveOriginals.has(moveRequested)) {
                    pendingMoveOriginals.set(moveRequested, { x: origX, y: origY });
                }
                await tpl.update(newPos);
            }
        }
        await openConfig(bar, "move", {
            pendingCustom, pendingGrid, pendingRemovals, pendingRemovalOriginals,
            pendingMoveOriginals, pendingResetPosition, originalPosition,
        });
        return;
    }

    if (!saved) {
        for (const [id, wasHidden] of pendingRemovalOriginals) {
            const tpl = canvas?.scene?.templates?.get(id);
            if (tpl) await tpl.update({ hidden: wasHidden });
        }
        for (const [id, origPos] of pendingMoveOriginals) {
            const tpl = canvas?.scene?.templates?.get(id);
            if (tpl) await tpl.update(origPos);
        }
        if (pendingResetPosition) bar.css(originalPosition);
        if (barHidden) bar.hide();
        else           bar.show();
    }
}

Hooks.once("init", () => {
    console.log(`${MODULE_TITLE} | Initialized`);
    game.settings.register(MODULE_ID, "barHidden", {
        name: "Hide Button Bar",
        hint: "Remove the button bar from the screen. Toggle this setting to bring it back.",
        scope: "client",
        config: true,
        type: Boolean,
        default: false,
        onChange: (value) => {
            if (value) $(".stp-template-bar").hide();
            else       $(".stp-template-bar").show();
        },
    });
});

Hooks.once("ready", () => {
    configOpen = false;
    const bar = $(`<div class="stp-template-bar">
        <div class="stp-bar-controls">
            <span class="stp-bar-handle" title="Drag to move bar">&#8801;</span>
            <button class="stp-place-btn" title="Place a template on the map">&#8853; Place</button>
            <button class="stp-move-btn" title="Move or remove placed templates">&#8597; Move</button>
            <button class="stp-config-btn" title="Configure templates">&#9881;</button>
        </div>
        <div class="stp-custom-grid"></div>
    </div>`);

    $("body").append(bar);
    applyBarPosition(bar);
    renderCustomButtons(bar);
    initBarDrag(bar);
    if (game.settings.get(MODULE_ID, "barHidden")) bar.hide();

    bar.find(".stp-place-btn").on("click",  () => openPlaceDialog());
    bar.find(".stp-move-btn").on("click", () => {
        if (configOpen) return;
        if (!canvas?.scene) {
            ui.notifications.warn(`${MODULE_TITLE}: No active scene.`);
            return;
        }
        if (canvas.scene.templates.contents.length === 0) {
            ui.notifications.warn(`${MODULE_TITLE}: No templates to move.`);
            return;
        }
        configOpen = true;
        openConfig(bar, "move").finally(() => { configOpen = false; });
    });
    bar.find(".stp-config-btn").on("click", () => {
        if (configOpen) return;
        configOpen = true;
        openConfig(bar).finally(() => { configOpen = false; });
    });
});

if (typeof module !== "undefined") module.exports = {};
})();
