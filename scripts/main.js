(function () {
const MODULE_ID = "star-template-placer";
const MODULE_TITLE = "Star Template Placer";

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

const TEMPLATE_TYPES = ["circle", "cone", "rect", "ray"];

function getCustomTemplates() {
    return game.user.getFlag(MODULE_ID, "customTemplates") ?? [];
}

function getViewCenter() {
    return { x: canvas.stage.pivot.x, y: canvas.stage.pivot.y };
}

async function placeTemplate({ t, distance, angle, fillColor }) {
    if (!canvas?.scene) {
        ui.notifications.warn(`${MODULE_TITLE}: No active scene.`);
        return;
    }
    const center = getViewCenter();
    await canvas.scene.createEmbeddedDocuments("MeasuredTemplate", [{
        t,
        x: center.x,
        y: center.y,
        distance: Math.max(5, distance),
        angle: angle ?? 57,
        direction: 0,
        fillColor,
        borderColor: fillColor,
        user: game.user.id,
    }]);
}

function templateOwnerName(t) {
    return t.author?.name ?? game.users?.get(t.user)?.name ?? "Unknown";
}

function templateDistanceFt(t) {
    const gridDistance = canvas?.scene?.grid?.distance ?? 1;
    return Math.round(t.distance * gridDistance);
}

function buildRemoveContent(templates) {
    const rows = templates.map(t => {
        const owner = escapeHtml(templateOwnerName(t));
        return `
            <tr data-id="${escapeHtml(t.id)}">
                <td>${owner}</td>
                <td>${escapeHtml(t.t)}</td>
                <td>${templateDistanceFt(t)}ft</td>
                <td class="stp-delete-cell">
                    <button type="button" class="stp-remove-template-btn">&#10005;</button>
                </td>
            </tr>
        `;
    }).join("");
    return `
        <table class="stp-config-table">
            <thead><tr><th>Owner</th><th>Shape</th><th>Size</th><th></th></tr></thead>
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

function renderCustomButtons(bar) {
    bar.find(".stp-custom-btn").remove();
    const configBtn = bar.find(".stp-config-btn");
    for (const tpl of getCustomTemplates()) {
        const btn = $("<button>")
            .addClass("stp-custom-btn")
            .attr("title", `${tpl.name} (${tpl.t}, ${tpl.distance}ft)`)
            .text(tpl.name);
        btn.css("border-left", `3px solid ${tpl.fillColor}`);
        btn.on("click", () => placeTemplate(tpl));
        btn.insertBefore(configBtn);
    }
}

function makeCustomRow(tpl, index) {
    const safeName  = escapeHtml(tpl.name);
    const safeType  = escapeHtml(tpl.t);
    const safeColor = escapeHtml(tpl.fillColor);
    return `
        <tr data-index="${index}">
            <td>${safeName}</td>
            <td>${safeType}</td>
            <td>${escapeHtml(String(tpl.distance))}ft</td>
            <td><span class="stp-color-swatch" style="background:${safeColor}"></span></td>
            <td class="stp-delete-cell"><button type="button" class="stp-delete-btn">&#10005;</button></td>
        </tr>
    `;
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
            <div class="stp-form-row">
                <label>Size (ft)</label>
                <input type="number" class="stp-distance-input" value="20" min="5" step="5">
            </div>
            <div class="stp-form-row stp-cone-row" style="display:none">
                <label>Angle (&deg;)</label>
                <input type="number" class="stp-angle-input" value="57" min="1" max="360">
            </div>
            <div class="stp-form-row">
                <label>Color</label>
                <input type="color" class="stp-color-input" value="${escapeHtml(defaultColor)}">
            </div>
        </div>
    `;

    await foundry.applications.api.DialogV2.wait({
        window:      { title: "Place Template" },
        content,
        rejectClose: false,
        buttons: [
            {
                action: "place",
                label: "Place",
                callback: async (event, button, dialog) => {
                    const $html     = $(dialog.element);
                    const t         = $html.find(".stp-type-select").val();
                    const distance  = Math.max(5, parseFloat($html.find(".stp-distance-input").val()) || 20);
                    const angle     = parseFloat($html.find(".stp-angle-input").val()) || 57;
                    const fillColor = $html.find(".stp-color-input").val();
                    await placeTemplate({ t, distance, angle, fillColor });
                }
            },
            { action: "cancel", label: "Cancel", default: true }
        ],
        render: (event, dialog) => {
            const $html = $(dialog.element);
            $html.on("change", ".stp-type-select", (e) => {
                $html.find(".stp-cone-row").toggle(e.target.value === "cone");
            });
        }
    });
}

async function openConfig(bar, initialTab = "templates") {
    const barHidden     = game.settings.get(MODULE_ID, "barHidden");
    const pendingCustom = [...getCustomTemplates()];

    let saved                = false;
    let pendingResetPosition = false;
    let originalPosition     = null;

    const typeOptions = TEMPLATE_TYPES.map(t =>
        `<option value="${t}">${t.charAt(0).toUpperCase() + t.slice(1)}</option>`
    ).join("");

    const tab   = (name) => `stp-tab${name === initialTab ? " stp-tab-active" : ""}`;
    const panel = (name) => `stp-tab-panel${name === initialTab ? "" : " stp-tab-panel-hidden"}`;

    const renderTemplatesBody = () => pendingCustom.length === 0
        ? '<tr class="stp-no-custom-row"><td colspan="5">No custom templates saved.</td></tr>'
        : pendingCustom.map((tpl, i) => makeCustomRow(tpl, i)).join("");

    const content = `
        <div class="stp-tabs">
            <button type="button" class="${tab("templates")}" data-tab="templates">Templates</button>
            <button type="button" class="${tab("remove")}"    data-tab="remove">Remove</button>
            <button type="button" class="${tab("reset")}"     data-tab="reset">Reset</button>
            <button type="button" class="${tab("extra")}"     data-tab="extra">Extra</button>
        </div>
        <div class="${panel("templates")}" data-panel="templates">
            <table class="stp-config-table">
                <thead>
                    <tr><th>Name</th><th>Shape</th><th>Size</th><th>Color</th><th></th></tr>
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
                    <div class="stp-form-row">
                        <label>Size (ft)</label>
                        <input type="number" class="stp-new-distance" value="20" min="5" step="5">
                    </div>
                    <div class="stp-form-row stp-new-cone-row" style="display:none">
                        <label>Angle (&deg;)</label>
                        <input type="number" class="stp-new-angle" value="57" min="1" max="360">
                    </div>
                    <div class="stp-form-row">
                        <label>Color</label>
                        <input type="color" class="stp-new-color" value="#ff0000">
                    </div>
                    <button type="button" class="stp-add-btn">Add Template</button>
                </div>
            </div>
        </div>
        <div class="${panel("remove")}" data-panel="remove"></div>
        <div class="${panel("extra")}" data-panel="extra">
            <div class="stp-extra-panel">
                <label class="stp-extra-item">
                    <input type="checkbox" class="stp-hide-bar-checkbox"${barHidden ? " checked" : ""}>
                    <div>
                        <strong>Hide Button Bar</strong>
                        <p>Hide the button bar from the screen. Changes take effect when you click Save.</p>
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
        window:      { title: "Star Template Placer — Configure" },
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
                    if (pendingResetPosition) {
                        await game.user.unsetFlag(MODULE_ID, "barPosition");
                    }
                    const newBarHidden = $html.find(".stp-hide-bar-checkbox").prop("checked");
                    await game.settings.set(MODULE_ID, "barHidden", newBarHidden);
                    if (newBarHidden) bar.hide();
                    else             bar.show();
                    renderCustomButtons(bar);
                }
            },
            { action: "cancel", label: "Cancel", default: true }
        ],
        render: (event, dialog) => {
            const $html = $(dialog.element);

            function renderRemoveTab() {
                const removePanelEl = $html.find('[data-panel="remove"]');
                const templates = canvas?.scene?.templates?.contents ?? [];
                if (templates.length === 0) {
                    removePanelEl.html('<p class="stp-remove-empty">No templates on the map.</p>');
                } else {
                    removePanelEl.html(buildRemoveContent(templates));
                }
            }

            // Tab switching
            $html.on("click", ".stp-tab", (e) => {
                const tabName = e.currentTarget.dataset.tab;
                $html.find(".stp-tab").removeClass("stp-tab-active");
                $(e.currentTarget).addClass("stp-tab-active");
                $html.find(".stp-tab-panel").addClass("stp-tab-panel-hidden");
                $html.find(`[data-panel="${tabName}"]`).removeClass("stp-tab-panel-hidden");
                if (tabName === "remove") renderRemoveTab();
            });

            // Cone angle row toggle in add form
            $html.on("change", ".stp-new-type", (e) => {
                $html.find(".stp-new-cone-row").toggle(e.target.value === "cone");
            });

            // Delete a custom template row
            $html.on("click", ".stp-delete-btn", (e) => {
                const index = parseInt($(e.currentTarget).closest("tr").data("index"));
                pendingCustom.splice(index, 1);
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
                const angle     = parseFloat($html.find(".stp-new-angle").val()) || 57;
                const fillColor = $html.find(".stp-new-color").val();
                pendingCustom.push({ name, t, distance, angle, fillColor });
                $html.find('[data-panel="templates"] tbody').html(renderTemplatesBody());
                $html.find(".stp-new-name").val("").focus();
            });

            $html.on("keydown", ".stp-new-name", (e) => {
                if (e.key === "Enter") $html.find(".stp-add-btn").trigger("click");
            });

            // Remove tab: delete individual templates immediately
            $html.on("click", ".stp-remove-template-btn", async (e) => {
                const row = $(e.currentTarget).closest("tr");
                const id  = row.attr("data-id");
                const tpl = canvas.scene.templates.get(id);
                if (tpl) {
                    try {
                        await tpl.delete();
                    } catch {
                        ui.notifications.warn(`${MODULE_TITLE}: Could not remove template.`);
                        return;
                    }
                }
                row.remove();
                if ($html.find('[data-panel="remove"] tbody tr[data-id]').length === 0) {
                    $html.find('[data-panel="remove"]').html('<p class="stp-remove-empty">No templates on the map.</p>');
                }
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

            if (initialTab === "remove") renderRemoveTab();
        }
    });

    if (!saved) {
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
    const bar = $(`<div class="stp-template-bar">
        <span class="stp-bar-handle" title="Drag to move bar">&#8801;</span>
        <button class="stp-place-btn" title="Place a template on the map">&#8853; Place</button>
        <button class="stp-remove-btn" title="Remove placed templates">&#10005; Remove</button>
        <button class="stp-config-btn" title="Configure templates">&#9881;</button>
    </div>`);

    $("body").append(bar);
    applyBarPosition(bar);
    renderCustomButtons(bar);
    initBarDrag(bar);
    if (game.settings.get(MODULE_ID, "barHidden")) bar.hide();

    bar.find(".stp-place-btn").on("click",  () => openPlaceDialog());
    bar.find(".stp-remove-btn").on("click", () => {
        if (!canvas?.scene) {
            ui.notifications.warn(`${MODULE_TITLE}: No active scene.`);
            return;
        }
        if (canvas.scene.templates.contents.length === 0) {
            ui.notifications.warn(`${MODULE_TITLE}: No templates to remove.`);
            return;
        }
        openConfig(bar, "remove");
    });
    bar.find(".stp-config-btn").on("click", () => openConfig(bar));
});

if (typeof module !== "undefined") module.exports = {};
})();
