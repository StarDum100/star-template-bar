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

function gridDist()       { return (canvas?.scene?.grid?.size ?? 100) / 20; }
function gridWidthScale() { return (canvas?.scene?.grid?.size ?? 100) / (canvas?.scene?.grid?.distance ?? 1); }

function getCustomTemplates() {
    return game.user.getFlag(MODULE_ID, "customTemplates") ?? [];
}

function getBarGrid(customTemplates = getCustomTemplates()) {
    const saved = game.user.getFlag(MODULE_ID, "barGrid");
    if (saved?.length) return saved;
    return [customTemplates.map(t => t.name)];
}

function placeTemplate({ t, distance, angle, width, height, fillColor, name }) {
    if (!canvas?.scene) {
        ui.notifications.warn(`${MODULE_TITLE}: No active scene.`);
        return;
    }

    const effectiveDistance = (t === "rect") ? (height ?? width) * Math.SQRT2 : distance;
    const templateData = {
        t,
        distance:    Math.max(5, effectiveDistance),
        angle:       angle ?? 53.13,
        width:       Math.max(5, width ?? distance),
        direction:   t === "rect" ? 45 : 0,
        fillColor,
        borderColor: fillColor,
        user:        game.user.id,
    };

    return new Promise((resolve) => {
        const { x: startX, y: startY } = canvas.mousePosition;
        const prevCursor = document.body.style.cursor;
        document.body.style.cursor = "crosshair";

        const doc = new CONFIG.MeasuredTemplate.documentClass({
            ...templateData, x: startX, y: startY,
        }, { parent: canvas.scene });

        const template = new CONFIG.MeasuredTemplate.objectClass(doc);
        canvas.templates.preview.addChild(template);
        template.draw?.().catch?.(() => {});

        const cleanup = () => {
            canvas.templates.preview.removeChild(template);
            template.destroy?.({ children: true });
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerdown", onPlace, { capture: true });
            window.removeEventListener("keydown", onCancel);
            document.body.style.cursor = prevCursor;
        };

        const onMove = () => {
            const { x, y } = canvas.mousePosition;
            const snapped  = canvas.grid.getSnappedPoint({ x, y });
            template.document.updateSource({ x: snapped.x, y: snapped.y });
            template.refresh?.();
        };

        const onPlace = async () => {
            cleanup();
            const { x: rawX, y: rawY } = canvas.mousePosition;
            const { x, y } = canvas.grid.getSnappedPoint({ x: rawX, y: rawY });
            await canvas.scene.createEmbeddedDocuments("MeasuredTemplate", [{
                ...templateData, x, y,
                flags: {
                    [MODULE_ID]: {
                        ...(name     ? { name }     : {}),
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

        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerdown", onPlace, { capture: true });
        window.addEventListener("keydown", onCancel);
    });
}

function pickNewPosition(templateData) {
    if (!canvas?.scene) return null;

    return new Promise((resolve) => {
        const prevCursor = document.body.style.cursor;
        document.body.style.cursor = "crosshair";

        const { _id, x: _x, y: _y, user: _user, ...baseData } = templateData;
        const { t } = baseData;
        const f = templateData.flags?.[MODULE_ID] ?? {};
        const { x: startX, y: startY } = canvas.mousePosition;

        let overrides = {};
        if (!f._nonModuleRect && !f._nonModule && (f.distance != null || f.width != null || f.height != null)) {
            const fd = f.distance ?? 20;
            const fw = f.width    ?? fd;
            const fh = f.height;
            overrides = {
                distance:  t === "rect" ? (fh ?? fw) * Math.SQRT2 : Math.max(5, fd),
                angle:     f.angle ?? 53.13,
                width:     Math.max(5, fw ?? fd),
                direction: t === "rect" ? 45 : 0,
            };
        } else {
            // Non-module template: undo v14's grid.size/20 scaling for a correctly sized preview.
            // distance uses grid.size/20 as its scale factor; width uses grid.size/grid.distance.
            overrides = {
                distance: baseData.distance / gridDist(),
                width:    baseData.width ? baseData.width / gridWidthScale() : baseData.distance / gridDist(),
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
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerdown", onPlace, { capture: true });
            window.removeEventListener("keydown", onCancel);
            document.body.style.cursor = prevCursor;
        };

        const onMove = () => {
            const { x, y } = canvas.mousePosition;
            const snapped  = canvas.grid.getSnappedPoint({ x, y });
            template.document.updateSource({ x: snapped.x, y: snapped.y });
            template.refresh?.();
        };

        const onPlace = () => {
            cleanup();
            const { x: rawX, y: rawY } = canvas.mousePosition;
            const { x, y } = canvas.grid.getSnappedPoint({ x: rawX, y: rawY });
            resolve({ x, y });
        };

        const onCancel = (e) => {
            if (e.key !== "Escape") return;
            cleanup();
            resolve(null);
        };

        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerdown", onPlace, { capture: true });
        window.addEventListener("keydown", onCancel);
    });
}

function templateOwnerName(t) {
    return t.user?.name ?? game.users?.get(t.user)?.name ?? "Unknown";
}

function templateDistanceFt(t) {
    return Math.round(t.distance / gridDist());
}

function buildMoveContent(templates, pendingMoveOriginals) {
    const rows = templates.map(t => {
        const f         = t.flags?.[MODULE_ID] ?? {};
        const name      = escapeHtml(String(f.name ?? ""));
        const owner     = escapeHtml(templateOwnerName(t));
        const safeColor = escapeHtml(String(t.fillColor ?? "#000000"));
        const angleCell = t.t === "cone" ? `${f.angle ?? t.angle ?? 53.13}°` : "—";
        let distCell;
        if (t.t === "rect") {
            if (f.width != null && f.height != null) {
                distCell = `${Math.round(f.width)}ft × ${Math.round(f.height)}ft`;
            } else {
                // templateDistanceFt returns the diagonal for direction-45 rects; convert to side length.
                const dist = templateDistanceFt(t);
                const side = Math.abs((t.direction ?? 0) - 45) < 1
                    ? Math.round(dist / Math.SQRT2)
                    : dist;
                distCell = `${side}ft`;
            }
        } else if (t.t === "ray") {
            const rayDist  = f.distance != null ? `${f.distance}` : `${templateDistanceFt(t)}`;
            const rayWidth = f.width    != null ? `${f.width}`    : `${Math.round((t.width ?? 0) / gridWidthScale())}`;
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

function buildTemplateFormHtml(prefix, color) {
    const p = `stp-${prefix}`;
    const typeOptions = TEMPLATE_TYPES.map(t =>
        `<option value="${t}">${t.charAt(0).toUpperCase() + t.slice(1)}</option>`
    ).join("");
    return `
        <div class="stp-form-row">
            <label>Shape</label>
            <select class="${p}type">${typeOptions}</select>
        </div>
        <div class="stp-form-row ${p}distance-row">
            <label>Size (ft)</label>
            <input type="number" class="${p}distance" value="20" min="5" step="5">
        </div>
        <div class="stp-form-row ${p}cone-row" style="display:none">
            <label>Angle (&deg;)</label>
            <input type="number" class="${p}angle" value="53.13" min="1" max="360">
        </div>
        <div class="stp-form-row ${p}width-row" style="display:none">
            <label>Width (ft)</label>
            <input type="number" class="${p}width" value="5" min="5" step="5">
        </div>
        <div class="stp-form-row ${p}height-row" style="display:none">
            <label>Height (ft)</label>
            <input type="number" class="${p}height" value="20" min="5" step="5">
        </div>
        <div class="stp-form-row">
            <label>Color</label>
            <input type="color" class="${p}color" value="${escapeHtml(color)}">
        </div>
    `;
}

function wireTypeToggle($html, prefix) {
    const p = `stp-${prefix}`;
    $html.on("change", `.${p}type`, (e) => {
        const type = e.target.value;
        $html.find(`.${p}cone-row`).toggle(type === "cone");
        $html.find(`.${p}width-row`).toggle(type === "rect" || type === "ray");
        $html.find(`.${p}height-row`).toggle(type === "rect");
        $html.find(`.${p}distance-row`).toggle(type !== "rect");
    });
}

function readTemplateForm($html, prefix) {
    const p = `stp-${prefix}`;
    return {
        t:         $html.find(`.${p}type`).val(),
        distance:  Math.max(5, parseFloat($html.find(`.${p}distance`).val()) || 20),
        angle:     parseFloat($html.find(`.${p}angle`).val()) || 53.13,
        width:     Math.max(5, parseFloat($html.find(`.${p}width`).val()) || 5),
        height:    Math.max(5, parseFloat($html.find(`.${p}height`).val()) || 20),
        fillColor: $html.find(`.${p}color`).val(),
    };
}

async function openPlaceDialog() {
    const rawColor = game.user.color?.css ?? game.user.color ?? "";
    const defaultColor = /^#[0-9a-fA-F]{6}$/.test(rawColor) ? rawColor : "#ff0000";

    const content = `
        <div class="stp-place-form">
            ${buildTemplateFormHtml("", defaultColor)}
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
                    const $html    = $(dialog.element);
                    templateConfig = readTemplateForm($html, "");
                }
            },
            { action: "cancel", label: "Cancel", default: true }
        ],
        render: (event, dialog) => {
            const $html = $(dialog.element);
            wireTypeToggle($html, "");
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
                    ${buildTemplateFormHtml("new-", "#ff0000")}
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
                    if (pendingRemovals.length) {
                        await canvas.scene.deleteEmbeddedDocuments("MeasuredTemplate", pendingRemovals);
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
            wireTypeToggle($html, "new-");

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
                const { t, distance, angle, width, height, fillColor } = readTemplateForm($html, "new-");
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
                    await canvas.scene.updateEmbeddedDocuments("MeasuredTemplate", [{ _id: id, hidden: true }]);
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
            const raw = tpl.toObject();
            const newPos = await pickNewPosition(raw);
            if (newPos) {
                const roundedPos = { x: Math.round(newPos.x), y: Math.round(newPos.y) };
                // Foundry v14 multiplies distance/width by grid.distance at creation time,
                // so we must pass the original un-scaled values to avoid doubling the size.
                const f        = raw.flags?.[MODULE_ID] ?? {};
                let distance, width, direction, flags;
                if (!f._nonModuleRect && !f._nonModule && (f.distance != null || f.width != null || f.height != null)) {
                    // Module template: reconstruct original inputs from flags
                    const fd = f.distance ?? 20;
                    const fw = f.width    ?? fd;
                    const fh = f.height;
                    distance  = raw.t === "rect" ? (fh ?? fw) * Math.SQRT2 : Math.max(5, fd);
                    width     = Math.max(5, fw ?? fd);
                    direction = raw.t === "rect" ? 45 : (raw.direction ?? 0);
                    flags     = raw.flags;
                } else {
                    // Non-module template: undo v14's scaling before recreating.
                    // distance uses grid.size/20 as its scale factor; width uses grid.size/grid.distance.
                    distance  = raw.distance / gridDist();
                    // For rects width=0 would make the template invisible, so fall back to distance.
                    // For rays and other types, preserve the original width.
                    width     = raw.t === "rect"
                        ? (raw.width ? raw.width / gridWidthScale() : distance)
                        : (raw.width ?? 0) / gridWidthScale();
                    direction = raw.direction ?? 0;
                    const safeFlags = { ...(raw.flags ?? {}) };
                    if (raw.t === "rect" && Math.abs((raw.direction ?? 0) - 45) < 1 && !f._nonModuleRect) {
                        // Direction-45 rect: store side lengths. _nonModuleRect prevents the module
                        // path from applying an extra ×√2 on subsequent moves.
                        const side = Math.round(distance / Math.SQRT2);
                        safeFlags[MODULE_ID] = { ...(safeFlags[MODULE_ID] ?? {}), width: side, height: side, _nonModuleRect: true };
                    } else if (raw.t !== "rect") {
                        // Circle, cone, ray: store computed ft values so the move tab displays them
                        // cleanly. _nonModule sentinel ensures subsequent moves always use the
                        // non-module path (preserving small widths without Math.max(5,...) clamping).
                        const stored = { distance: Math.round(distance), _nonModule: true };
                        if (raw.t === "ray")  stored.width = Math.round(width);
                        if (raw.t === "cone") stored.angle = Math.round(raw.angle ?? 53.13);
                        safeFlags[MODULE_ID] = { ...(safeFlags[MODULE_ID] ?? {}), ...stored };
                    }
                    flags = safeFlags;
                }
                const origData = pendingMoveOriginals.get(moveRequested) ?? {
                    t: raw.t, distance, angle: f.angle ?? raw.angle, width,
                    direction, fillColor: raw.fillColor, borderColor: raw.borderColor,
                    user: raw.user, flags, x: raw.x, y: raw.y,
                };
                const createData = { ...origData, x: roundedPos.x, y: roundedPos.y };
                await canvas.scene.deleteEmbeddedDocuments("MeasuredTemplate", [moveRequested]);
                pendingMoveOriginals.delete(moveRequested);
                const [newDoc] = await canvas.scene.createEmbeddedDocuments("MeasuredTemplate", [createData]);
                if (newDoc?.id) {
                    pendingMoveOriginals.set(newDoc.id, origData);
                }
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
            await canvas.scene.updateEmbeddedDocuments("MeasuredTemplate", [{ _id: id, hidden: wasHidden }]);
        }
        for (const [newId, origData] of pendingMoveOriginals) {
            await canvas.scene.deleteEmbeddedDocuments("MeasuredTemplate", [newId]);
            await canvas.scene.createEmbeddedDocuments("MeasuredTemplate", [origData]);
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
    renderCustomButtons(bar);
    initBarDrag(bar);
    // Defer until after the browser has laid out the element so outerWidth() is accurate,
    // which makes the default centred position match what "Reset Position" produces.
    requestAnimationFrame(() => {
        applyBarPosition(bar);
        if (game.settings.get(MODULE_ID, "barHidden")) bar.hide();
    });

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
