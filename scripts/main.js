// IIFE so module-scoped declarations (MODULE_ID, MODULE_TITLE, etc.) never leak into a
// shared/global scope. Sibling modules each declare `const MODULE_ID`; without this wrapper,
// loading them in the same realm (e.g. as classic scripts, or a hot-reload re-eval) throws
// "Identifier 'MODULE_ID' has already been declared".
(function () {
const MODULE_ID = "star-template-bar";
const MODULE_TITLE = "Star Template Bar";

let configOpen = false;

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function cssColor(value, fallback = "#000000") {
    return /^#[0-9a-fA-F]{3,8}$/.test(String(value)) ? String(value) : fallback;
}

const TEMPLATE_TYPES = ["circle", "cone", "ray", "rect"];

function gridDist()       { return (canvas?.scene?.grid?.size ?? 100) / 20; }
function gridWidthScale() { return (canvas?.scene?.grid?.size ?? 100) / (canvas?.scene?.grid?.distance || 1); }

function getCustomTemplates() {
    return game.user.getFlag(MODULE_ID, "customTemplates") ?? [];
}

function getBarGrid(customTemplates = getCustomTemplates()) {
    const saved = game.user.getFlag(MODULE_ID, "barGrid");
    if (saved?.length) return saved;
    return [customTemplates.map(t => t.name)];
}

function withPlacementListeners(template, onPlaceCb) {
    const prevCursor = document.body.style.cursor;
    document.body.style.cursor = "crosshair";

    return new Promise((resolve) => {
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
            resolve(await onPlaceCb());
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

    const { x: startX, y: startY } = canvas.mousePosition;
    const doc = new CONFIG.MeasuredTemplate.documentClass({
        ...templateData, x: startX, y: startY,
    }, { parent: canvas.scene });
    const template = new CONFIG.MeasuredTemplate.objectClass(doc);
    canvas.templates.preview.addChild(template);
    template.draw?.().catch?.(() => {});

    return withPlacementListeners(template, async () => {
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
    });
}

function pickNewPosition(templateData) {
    if (!canvas?.scene) return null;

    const { _id, x: _x, y: _y, user: _user, ...baseData } = templateData;
    const { t } = baseData;
    const f = templateData.flags?.[MODULE_ID] ?? {};
    const { x: startX, y: startY } = canvas.mousePosition;

    let overrides;
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

    return withPlacementListeners(template, () => {
        const { x: rawX, y: rawY } = canvas.mousePosition;
        const { x, y } = canvas.grid.getSnappedPoint({ x: rawX, y: rawY });
        return { x, y };
    });
}

function templateToCreateData(raw) {
    const f = raw.flags?.[MODULE_ID] ?? {};
    let distance, width, direction, flags;
    if (!f._nonModuleRect && !f._nonModule && (f.distance != null || f.width != null || f.height != null)) {
        const fd = f.distance ?? 20;
        const fw = f.width    ?? fd;
        const fh = f.height;
        distance  = raw.t === "rect" ? (fh ?? fw) * Math.SQRT2 : Math.max(5, fd);
        width     = Math.max(5, fw ?? fd);
        direction = raw.t === "rect" ? 45 : (raw.direction ?? 0);
        flags     = raw.flags;
    } else {
        distance  = raw.distance / gridDist();
        width     = raw.t === "rect"
            ? (raw.width ? raw.width / gridWidthScale() : distance)
            : (raw.width ?? 0) / gridWidthScale();
        direction = raw.direction ?? 0;
        const safeFlags = { ...(raw.flags ?? {}) };
        if (raw.t === "rect" && Math.abs((raw.direction ?? 0) - 45) < 1 && !f._nonModuleRect) {
            const side = Math.round(distance / Math.SQRT2);
            safeFlags[MODULE_ID] = { ...(safeFlags[MODULE_ID] ?? {}), width: side, height: side, _nonModuleRect: true };
        } else if (raw.t !== "rect") {
            const stored = { distance: Math.round(distance), _nonModule: true };
            if (raw.t === "ray")  stored.width = Math.round(width);
            if (raw.t === "cone") stored.angle = Math.round(raw.angle ?? 53.13);
            safeFlags[MODULE_ID] = { ...(safeFlags[MODULE_ID] ?? {}), ...stored };
        }
        flags = safeFlags;
    }
    return {
        t: raw.t, distance, angle: f.angle ?? raw.angle, width,
        direction, fillColor: raw.fillColor, borderColor: raw.borderColor,
        user: raw.user, flags, x: raw.x, y: raw.y,
    };
}

function canManageTemplate(t) {
    return game.user.isGM || (t.user?.id ?? t.user) === game.user.id;
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
        const safeColor = cssColor(t.fillColor);
        const angleCell = t.t === "cone" ? `${f.angle ?? t.angle ?? 53.13}Â°` : "â€”";
        let distCell;
        if (t.t === "rect") {
            if (f.width != null && f.height != null) {
                distCell = `${Math.round(f.width)}ft Ã— ${Math.round(f.height)}ft`;
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
            distCell = `${rayDist}ft Ã— ${rayWidth}ft`;
        } else {
            distCell = f.distance != null ? `${f.distance}ft` : `${templateDistanceFt(t)}ft`;
        }
        const moved = pendingMoveOriginals.has(t.id);
        return `
            <tr data-id="${escapeHtml(t.id)}"${moved ? ' class="stb-pending-move"' : ''}>
                <td>${name}</td>
                <td>${owner}</td>
                <td>${escapeHtml(t.t)}</td>
                <td>${distCell}</td>
                <td>${angleCell}</td>
                <td><span class="stb-color-swatch" style="background:${safeColor}"></span></td>
                <td class="stb-action-cell">
                    <button type="button" class="stb-move-template-btn" title="Pick up and move this template">&#9999;</button>
                    <button type="button" class="stb-remove-template-btn" title="Delete this template">&#10005;</button>
                </td>
            </tr>
        `;
    }).join("");
    return `
        <table class="stb-config-table">
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
    bar.find(".stb-bar-handle").on("mousedown", (e) => {
        e.preventDefault();
        startX    = e.clientX;
        startY    = e.clientY;
        startLeft = parseInt(bar.css("left")) || 0;
        startTop  = parseInt(bar.css("top"))  || 0;

        $(document).on("mousemove.stb-drag", (e) => {
            const left = Math.max(0, Math.min(window.innerWidth  - bar.outerWidth(),  startLeft + e.clientX - startX));
            const top  = Math.max(0, Math.min(window.innerHeight - bar.outerHeight(), startTop  + e.clientY - startY));
            bar.css({ left, top });
        });

        $(document).on("mouseup.stb-drag", () => {
            $(document).off("mousemove.stb-drag mouseup.stb-drag");
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

    const gridEl  = bar.find(".stb-custom-grid");
    gridEl.empty();

    const multirow = grid.length > 1;
    bar.toggleClass("stb-bar-multirow", multirow);
    if (multirow) {
        const maxCols = Math.max(...grid.map(r => r.length));
        gridEl.css("--stb-cols", maxCols);
    } else {
        gridEl.css("--stb-cols", "");
    }

    for (const row of grid) {
        const rowEl = $('<div class="stb-bar-row">');
        for (const name of row) {
            if (!knownNames.has(name)) continue;
            const tpl = byName[name];
            const btn = $("<button>")
                .addClass("stb-custom-btn")
                .attr("title", `${tpl.name} (${tpl.t}, ${tpl.distance}ft)`)
                .text(tpl.name);
            btn.css("border-left", `3px solid ${cssColor(tpl.fillColor)}`);
            btn.on("click", () => placeTemplate(tpl));
            rowEl.append(btn);
        }
        gridEl.append(rowEl);
    }
}

function makeCustomRow(tpl, index) {
    const safeName  = escapeHtml(tpl.name);
    const safeType  = escapeHtml(tpl.t);
    const safeColor = cssColor(tpl.fillColor);
    const widthCell = tpl.t === "ray"  ? `${tpl.width ?? 5}ft`
                   : tpl.t === "rect" ? `${tpl.width ?? 5}ft Ã— ${tpl.height ?? 5}ft`
                   : "â€”";
    const angleCell = tpl.t === "cone" ? `${tpl.angle ?? 53.13}Â°` : "â€”";
    return `
        <tr data-index="${index}">
            <td>${safeName}</td>
            <td>${safeType}</td>
            <td>${tpl.t === "rect" ? "â€”" : `${escapeHtml(String(tpl.distance))}ft`}</td>
            <td>${widthCell}</td>
            <td>${angleCell}</td>
            <td><span class="stb-color-swatch" style="background:${safeColor}"></span></td>
            <td class="stb-delete-cell"><button type="button" class="stb-delete-btn">&#10005;</button></td>
        </tr>
    `;
}

function renderLayoutEditor(html, pendingGrid, pendingCustom) {
    const panel = html.find('[data-panel="layout"]');
    panel.empty();

    const knownNames = new Set(pendingCustom.map(t => t.name));
    const flat = pendingGrid.flat().filter(name => knownNames.has(name));

    if (flat.length === 0) {
        panel.append('<p class="stb-layout-empty">No custom templates configured. Add templates on the Templates tab.</p>');
        return;
    }

    const numRows = pendingGrid.length || 1;
    const numCols = Math.ceil(flat.length / numRows);

    panel.append('<p class="stb-layout-hint">Drag any template to a slot to reorder &middot; Change the row count to reorganize the grid</p>');

    const controls = $('<div class="stb-layout-controls">');
    const rowInput  = $('<input type="number" class="stb-rows-input">')
        .attr("min", 1).attr("max", flat.length).val(numRows);
    controls.append($('<label class="stb-rows-label">').text("Number of Rows: ").append(rowInput));
    panel.append(controls);

    const editor = $('<div class="stb-layout-editor">');
    for (let r = 0; r < numRows; r++) {
        const rowEl = $('<div class="stb-layout-row">');
        for (let c = 0; c < numCols; c++) {
            const idx = r * numCols + c;
            if (idx < flat.length) {
                rowEl.append(
                    $('<div class="stb-layout-tile" draggable="true">')
                        .attr("data-index", idx)
                        .text(flat[idx])
                );
            } else {
                rowEl.append($('<div class="stb-layout-slot">').attr("data-index", idx));
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
    const p = `stb-${prefix}`;
    const typeOptions = TEMPLATE_TYPES.map(t =>
        `<option value="${t}">${t.charAt(0).toUpperCase() + t.slice(1)}</option>`
    ).join("");
    return `
        <div class="stb-form-row">
            <label>Shape</label>
            <select class="${p}type">${typeOptions}</select>
        </div>
        <div class="stb-form-row ${p}distance-row">
            <label>Size (ft)</label>
            <input type="number" class="${p}distance" value="20" min="5" step="5">
        </div>
        <div class="stb-form-row ${p}cone-row" style="display:none">
            <label>Angle (&deg;)</label>
            <input type="number" class="${p}angle" value="53.13" min="1" max="360">
        </div>
        <div class="stb-form-row ${p}width-row" style="display:none">
            <label>Width (ft)</label>
            <input type="number" class="${p}width" value="5" min="5" step="5">
        </div>
        <div class="stb-form-row ${p}height-row" style="display:none">
            <label>Height (ft)</label>
            <input type="number" class="${p}height" value="20" min="5" step="5">
        </div>
        <div class="stb-form-row">
            <label>Color</label>
            <input type="color" class="${p}color" value="${escapeHtml(color)}">
        </div>
    `;
}

function wireTypeToggle($html, prefix) {
    const p = `stb-${prefix}`;
    $html.on("change", `.${p}type`, (e) => {
        const type = e.target.value;
        $html.find(`.${p}cone-row`).toggle(type === "cone");
        $html.find(`.${p}width-row`).toggle(type === "rect" || type === "ray");
        $html.find(`.${p}height-row`).toggle(type === "rect");
        $html.find(`.${p}distance-row`).toggle(type !== "rect");
    });
}

function readTemplateForm($html, prefix) {
    const p = `stb-${prefix}`;
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
        <div class="stb-place-form">
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

    let saved                 = false;
    let pendingResetPosition  = resumeState?.pendingResetPosition ?? false;
    let originalPosition      = resumeState?.originalPosition     ?? null;
    let pendingClearTemplates = false;
    const pendingRemovalOriginals = resumeState?.pendingRemovalOriginals ?? new Map();
    const pendingMoveOriginals     = resumeState?.pendingMoveOriginals     ?? new Map();

    let moveRequested = null;

    const tab   = (name) => `stb-tab${name === initialTab ? " stb-tab-active" : ""}`;
    const panel = (name) => `stb-tab-panel${name === initialTab ? "" : " stb-tab-panel-hidden"}`;

    const renderTemplatesBody = () => pendingCustom.length === 0
        ? '<tr class="stb-no-custom-row"><td colspan="7">No custom templates saved.</td></tr>'
        : pendingCustom.map((tpl, i) => makeCustomRow(tpl, i)).join("");

    function renderMoveTab($html) {
        const movePanelEl = $html.find('[data-panel="move"]');
        const templates = (canvas?.scene?.templates?.contents ?? [])
            .filter(canManageTemplate);
        if (templates.length === 0) {
            movePanelEl.html('<p class="stb-move-empty">No templates on the map.</p>');
        } else {
            movePanelEl.html(buildMoveContent(templates, pendingMoveOriginals));
        }
    }

    function wireTemplatesTab($html) {
        wireTypeToggle($html, "new-");

        $html.on("click", ".stb-delete-btn", (e) => {
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

        $html.on("click", ".stb-add-btn", () => {
            const name = $html.find(".stb-new-name").val().trim();
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
            $html.find(".stb-new-name").val("").focus();
        });

        $html.on("keydown", ".stb-new-name", (e) => {
            if (e.key === "Enter") $html.find(".stb-add-btn").trigger("click");
        });
    }

    function wireMoveTab($html, dialog) {
        $html.on("click", ".stb-remove-template-btn", async (e) => {
            const row = $(e.currentTarget).closest("tr");
            const id  = row.attr("data-id");
            const stagedTpl = canvas?.scene?.templates?.get(id);
            if (stagedTpl) {
                // If this template was moved earlier in this session, restoring it on cancel must
                // recreate the original pre-move template, not the moved copy. Hand the move's
                // original data to the removal rollback and drop the move entry so it isn't
                // restored twice.
                if (pendingMoveOriginals.has(id)) {
                    pendingRemovalOriginals.set(id, pendingMoveOriginals.get(id));
                    pendingMoveOriginals.delete(id);
                } else {
                    pendingRemovalOriginals.set(id, templateToCreateData(stagedTpl.toObject()));
                }
                await canvas.scene.deleteEmbeddedDocuments("MeasuredTemplate", [id]);
            }
            row.remove();
            if ($html.find('[data-panel="move"] tbody tr[data-id]').length === 0) {
                $html.find('[data-panel="move"]').html('<p class="stb-move-empty">No templates on the map.</p>');
            }
        });

        $html.on("click", ".stb-move-template-btn", (e) => {
            const id  = $(e.currentTarget).closest("tr").attr("data-id");
            const tpl = canvas?.scene?.templates?.get(id);
            if (!tpl) return;
            moveRequested = id;
            dialog.close();
        });
    }

    function wireLayoutTab($html) {
        let dragIndex = -1;

        $html.on("dragstart", ".stb-layout-tile", (e) => {
            dragIndex = parseInt($(e.currentTarget).data("index"));
            e.originalEvent.dataTransfer.effectAllowed = "move";
            setTimeout(() => $(e.currentTarget).addClass("stb-dragging"), 0);
        });

        $html.on("dragend", ".stb-layout-tile", () => {
            $html.find(".stb-layout-tile, .stb-layout-slot").removeClass("stb-dragging stb-slot-over");
            dragIndex = -1;
        });

        $html.on("dragover", ".stb-layout-tile, .stb-layout-slot", (e) => {
            const idx = parseInt($(e.currentTarget).data("index"));
            if (dragIndex === -1 || idx === dragIndex) return;
            e.preventDefault();
            $html.find(".stb-layout-tile, .stb-layout-slot").removeClass("stb-slot-over");
            $(e.currentTarget).addClass("stb-slot-over");
        });

        $html.on("dragleave", ".stb-layout-tile, .stb-layout-slot", (e) => {
            $(e.currentTarget).removeClass("stb-slot-over");
        });

        $html.on("drop", ".stb-layout-tile, .stb-layout-slot", (e) => {
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

        $html.on("change", ".stb-rows-input", (e) => {
            const flat = pendingGrid.flat();
            let n = parseInt(e.target.value);
            if (isNaN(n) || n < 1) n = 1;
            if (n > flat.length) n = flat.length;
            $(e.target).val(n);
            reshapeGrid(pendingGrid, n, flat);
            renderLayoutEditor($html, pendingGrid, pendingCustom);
        });
    }

    function wireExtraTab($html) {
        $html.on("change", ".stb-hide-bar-checkbox", (e) => {
            if (e.target.checked) bar.hide();
            else                  bar.show();
        });
    }

    function wireResetTab($html) {
        $html.on("click", ".stb-reset-position-btn", () => {
            if (!pendingResetPosition) {
                originalPosition = {
                    left: parseInt(bar.css("left")),
                    top:  parseInt(bar.css("top")),
                };
            }
            pendingResetPosition = true;
            applyBarPosition(bar, null);
        });

        $html.on("click", ".stb-clear-templates-btn", () => {
            pendingClearTemplates = true;
            pendingCustom.splice(0);
            pendingGrid.splice(0, pendingGrid.length, []);
            $html.find('[data-panel="templates"] tbody').html(renderTemplatesBody());

            if (!$html.find("[data-panel='layout']").hasClass("stb-tab-panel-hidden")) {
                renderLayoutEditor($html, pendingGrid, pendingCustom);
            }

            renderCustomButtons(bar, { customTemplates: [], grid: [[]] });
        });
    }

    const content = `
        <div class="stb-tabs">
            <button type="button" class="${tab("templates")}" data-tab="templates">Templates</button>
            <button type="button" class="${tab("move")}"      data-tab="move">Move</button>
            <button type="button" class="${tab("layout")}"    data-tab="layout">Layout</button>
            <button type="button" class="${tab("reset")}"     data-tab="reset">Reset</button>
            <button type="button" class="${tab("extra")}"     data-tab="extra">Extra</button>
        </div>
        <div class="${panel("templates")}" data-panel="templates">
            <table class="stb-config-table">
                <thead>
                    <tr><th>Name</th><th>Shape</th><th>Size</th><th>Width</th><th>Angle</th><th>Color</th><th></th></tr>
                </thead>
                <tbody>
                    ${renderTemplatesBody()}
                </tbody>
            </table>
            <div class="stb-add-section">
                <div class="stb-add-form">
                    <div class="stb-form-row">
                        <label>Name</label>
                        <input type="text" class="stb-new-name" placeholder="e.g. Fireball">
                    </div>
                    ${buildTemplateFormHtml("new-", "#ff0000")}
                    <button type="button" class="stb-add-btn">Add Template</button>
                </div>
            </div>
        </div>
        <div class="${panel("layout")}" data-panel="layout"></div>
        <div class="${panel("move")}" data-panel="move"></div>
        <div class="${panel("extra")}" data-panel="extra">
            <div class="stb-extra-panel">
                <label class="stb-extra-item">
                    <input type="checkbox" class="stb-hide-bar-checkbox"${barHidden ? " checked" : ""}>
                    <div>
                        <strong>Hide Button Bar</strong>
                        <p>Hide the button bar from the screen.</p>
                        <p>To restore it, uncheck this option in Configure Game Settings.</p>
                    </div>
                </label>
            </div>
        </div>
        <div class="${panel("reset")}" data-panel="reset">
            <div class="stb-reset-panel">
                <div class="stb-reset-item">
                    <div>
                        <strong>Reset Bar Position</strong>
                        <p>Move the button bar to the default position at the top center of the screen.</p>
                    </div>
                    <button type="button" class="stb-reset-position-btn">Reset Position</button>
                </div>
                <div class="stb-reset-item">
                    <div>
                        <strong>Clear All Templates</strong>
                        <p>Remove every template from the bar.</p>
                    </div>
                    <button type="button" class="stb-clear-templates-btn">Clear Templates</button>
                </div>
            </div>
        </div>
    `;

    await foundry.applications.api.DialogV2.wait({
        window:      { title: "Star Template Bar â€” Configure (save to persist changes)" },
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

                    if (pendingResetPosition) {
                        await game.user.unsetFlag(MODULE_ID, "barPosition");
                    }
                    const newBarHidden = $html.find(".stb-hide-bar-checkbox").prop("checked");
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

            $html.on("click", ".stb-tab", (e) => {
                const tabName = e.currentTarget.dataset.tab;
                $html.find(".stb-tab").removeClass("stb-tab-active");
                $(e.currentTarget).addClass("stb-tab-active");
                $html.find(".stb-tab-panel").addClass("stb-tab-panel-hidden");
                $html.find(`[data-panel="${tabName}"]`).removeClass("stb-tab-panel-hidden");
                if (tabName === "move")   renderMoveTab($html);
                if (tabName === "layout") renderLayoutEditor($html, pendingGrid, pendingCustom);
            });

            wireTemplatesTab($html);
            wireMoveTab($html, dialog);
            wireLayoutTab($html);
            wireExtraTab($html);
            wireResetTab($html);

            if (initialTab === "move")   renderMoveTab($html);
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
                const origData = pendingMoveOriginals.get(moveRequested) ?? templateToCreateData(raw);
                const createData = { ...origData, x: roundedPos.x, y: roundedPos.y };
                await canvas.scene.deleteEmbeddedDocuments("MeasuredTemplate", [moveRequested]);
                pendingMoveOriginals.delete(moveRequested);
                try {
                    const [newDoc] = await canvas.scene.createEmbeddedDocuments("MeasuredTemplate", [createData]);
                    if (newDoc?.id) {
                        pendingMoveOriginals.set(newDoc.id, origData);
                    }
                } catch (err) {
                    // The original was already deleted; recreate it so the move failure doesn't lose the template.
                    console.error(`${MODULE_TITLE} | Failed to place moved template; restoring original.`, err);
                    await canvas.scene.createEmbeddedDocuments("MeasuredTemplate", [origData]);
                }
            }
        }
        await openConfig(bar, "move", {
            pendingCustom, pendingGrid, pendingRemovalOriginals,
            pendingMoveOriginals, pendingResetPosition, originalPosition,
        });
        return;
    }

    if (!saved) {
        for (const origData of pendingRemovalOriginals.values()) {
            try {
                await canvas.scene.createEmbeddedDocuments("MeasuredTemplate", [origData]);
            } catch (err) {
                console.error(`${MODULE_TITLE} | Failed to restore a deleted template on cancel.`, err);
            }
        }
        for (const [newId, origData] of pendingMoveOriginals) {
            try {
                await canvas.scene.deleteEmbeddedDocuments("MeasuredTemplate", [newId]);
                await canvas.scene.createEmbeddedDocuments("MeasuredTemplate", [origData]);
            } catch (err) {
                console.error(`${MODULE_TITLE} | Failed to restore a moved template on cancel.`, err);
            }
        }
        if (pendingResetPosition) bar.css(originalPosition);
        if (pendingClearTemplates) renderCustomButtons(bar);
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
            if (value) $(".stb-template-bar").hide();
            else       $(".stb-template-bar").show();
        },
    });
});

Hooks.once("ready", () => {
    configOpen = false;
    const bar = $(`<div class="stb-template-bar">
        <div class="stb-bar-controls">
            <span class="stb-bar-handle" title="Drag to move bar">&#8801;</span>
            <button class="stb-place-btn" title="Place a template on the map">&#8853; Place</button>
            <button class="stb-move-btn" title="Move or remove placed templates">&#8597; Move</button>
            <button class="stb-config-btn" title="Configure templates">&#9881;</button>
        </div>
        <div class="stb-custom-grid"></div>
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

    bar.find(".stb-place-btn").on("click",  () => openPlaceDialog());
    bar.find(".stb-move-btn").on("click", () => {
        if (configOpen) return;
        if (!canvas?.scene) {
            ui.notifications.warn(`${MODULE_TITLE}: No active scene.`);
            return;
        }
        const movable = canvas.scene.templates.contents.filter(canManageTemplate);
        if (movable.length === 0) {
            ui.notifications.warn(`${MODULE_TITLE}: No templates to move.`);
            return;
        }
        configOpen = true;
        openConfig(bar, "move").finally(() => { configOpen = false; });
    });
    bar.find(".stb-config-btn").on("click", () => {
        if (configOpen) return;
        configOpen = true;
        openConfig(bar).finally(() => { configOpen = false; });
    });
});

if (typeof module !== "undefined") module.exports = {};
})();

