const $ = require("jquery");

const hookCallbacks = {};

global.$ = $;
global.Hooks = {
    once: jest.fn((event, cb) => { hookCallbacks[event] = cb; }),
    on:   jest.fn(() => 0),
    off:  jest.fn(),
};
global.game = {
    user: {
        id: "user-001",
        color: { css: "#4488ff" },
        getFlag:   jest.fn().mockReturnValue(undefined),
        setFlag:   jest.fn().mockResolvedValue(undefined),
        unsetFlag: jest.fn().mockResolvedValue(undefined),
    },
    users: {
        get: jest.fn().mockReturnValue({ name: "TestUser" }),
    },
    settings: {
        register: jest.fn(),
        get:      jest.fn().mockReturnValue(false),
        set:      jest.fn().mockResolvedValue(undefined),
    },
};
const mockTemplateObject = {
    document: null,
    draw:    jest.fn().mockResolvedValue(undefined),
    refresh: jest.fn(),
    destroy: jest.fn(),
};
global.CONFIG = {
    MeasuredTemplate: {
        documentClass: jest.fn().mockImplementation(function(data) {
            this.updateSource = jest.fn((update) => Object.assign(this, update));
            Object.assign(this, data);
        }),
        objectClass: jest.fn().mockImplementation((doc) => {
            mockTemplateObject.document = doc;
            return mockTemplateObject;
        }),
    },
};
global.canvas = {
    stage: { pivot: { x: 500, y: 400 } },
    mousePosition: { x: 500, y: 400 },
    grid: {
        getSnappedPosition: jest.fn((x, y) => ({ x, y })),
    },
    app: {
        view: {
            addEventListener:    jest.fn(),
            removeEventListener: jest.fn(),
        },
    },
    templates: {
        preview: {
            addChild:    jest.fn(),
            removeChild: jest.fn(),
        },
        placeables: [],
    },
    scene: {
        grid: { size: 100, distance: 5 },
        templates: {
            contents: [],
            get: jest.fn(),
        },
        createEmbeddedDocuments: jest.fn().mockResolvedValue([]),
        updateEmbeddedDocuments: jest.fn().mockResolvedValue([]),
        deleteEmbeddedDocuments: jest.fn().mockResolvedValue([]),
    },
};
global.ui = {
    notifications: {
        warn: jest.fn(),
        info: jest.fn(),
    },
};
global.requestAnimationFrame = cb => cb();
global.foundry = { applications: { api: { DialogV2: {} } } };
global.foundry.applications.api.DialogV2.wait = jest.fn().mockImplementation((options) => {
    global.foundry.applications.api.DialogV2.__lastOptions = options;
    let resolveDialog;
    const instance = {
        render: jest.fn(),
        close:  jest.fn(() => resolveDialog?.(null)),
        element: document.createElement("div"),
    };
    global.foundry.applications.api.DialogV2.__lastInstance = instance;
    global.foundry.applications.api.DialogV2.__resolveDialog = (val) => resolveDialog(val);
    return new Promise(r => { resolveDialog = r; });
});

require("../scripts/main.js");

// Wrap window.addEventListener so tests can inspect pointerdown registrations
// while still delegating to the real jsdom implementation.
const _origWindowAEL = window.addEventListener.bind(window);
window.addEventListener = jest.fn((...args) => _origWindowAEL(...args));

// ── Helpers ───────────────────────────────────────────────────────────────

function openDialogHtml() {
    const options  = global.foundry.applications.api.DialogV2.__lastOptions;
    const instance = global.foundry.applications.api.DialogV2.__lastInstance;
    const container = document.createElement("div");
    container.innerHTML = options.content;
    instance.element = container;
    options.render(new Event("render"), instance);
    const html = $(container);
    return { html, options };
}

async function simulateCanvasClick() {
    const calls = window.addEventListener.mock.calls
        .filter(c => c[0] === "pointerdown");
    const handler = calls[calls.length - 1]?.[1];
    if (!handler) return;
    await handler({ target: global.canvas.app.view });
    await new Promise(r => setTimeout(r, 0));
}

async function triggerPlaceFromDialog(htmlModifier) {
    document.querySelector(".stp-place-btn").click();
    const { html, options } = openDialogHtml();
    if (htmlModifier) htmlModifier(html);
    const container = global.foundry.applications.api.DialogV2.__lastInstance.element;
    const placeBtn  = options.buttons.find(b => b.action === "place");
    placeBtn.callback(null, null, { element: container });
    global.foundry.applications.api.DialogV2.__resolveDialog("place");
    await new Promise(r => setTimeout(r, 0));
    await simulateCanvasClick();
}

function setupBar(flagOverrides = {}) {
    const { barHidden, ...flagsOnly } = flagOverrides;
    global.game.user.getFlag.mockImplementation((ns, key) => flagsOnly[key] ?? undefined);
    global.game.settings.get.mockImplementation((ns, key) => key === "barHidden" ? (barHidden ?? false) : false);
    global.canvas.scene.templates.contents = [];
    global.canvas.scene.templates.get = jest.fn(id =>
        global.canvas.scene.templates.contents.find(t => t.id === id)
    );
    let _autoId = 0;
    global.canvas.scene.createEmbeddedDocuments = jest.fn().mockImplementation(async (type, dataArray) => {
        if (type !== "MeasuredTemplate") return [];
        return dataArray.map(d => {
            const id = `created-${++_autoId}`;
            const doc = { id, ...d, toObject: jest.fn(() => ({ ...d, _id: id })), update: jest.fn().mockResolvedValue(undefined), delete: jest.fn().mockResolvedValue(undefined) };
            global.canvas.scene.templates.contents = [...global.canvas.scene.templates.contents, doc];
            return doc;
        });
    });
    global.canvas.scene.updateEmbeddedDocuments = jest.fn().mockResolvedValue([]);
    global.canvas.scene.deleteEmbeddedDocuments = jest.fn().mockImplementation(async (type, ids) => {
        if (type === "MeasuredTemplate") {
            global.canvas.scene.templates.contents = global.canvas.scene.templates.contents.filter(t => !ids.includes(t.id));
        }
        return ids;
    });
    global.canvas.app.view.addEventListener.mockClear();
    global.canvas.app.view.removeEventListener.mockClear();
    window.addEventListener.mockClear();
    global.canvas.grid.getSnappedPosition.mockClear();
    global.canvas.templates.preview.addChild.mockClear();
    global.canvas.templates.preview.removeChild.mockClear();
    global.canvas.templates.placeables = [];
    global.CONFIG.MeasuredTemplate.documentClass.mockClear();
    global.CONFIG.MeasuredTemplate.objectClass.mockClear();
    mockTemplateObject.draw.mockClear();
    mockTemplateObject.refresh.mockClear();
    mockTemplateObject.destroy.mockClear();
    document.body.innerHTML = "";
    hookCallbacks["ready"]();
}

function makeTemplate(id, user, t, distance) {
    const originalData = { fillColor: "#ff4400", borderColor: "#ff4400", t, distance, x: 100, y: 100, hidden: false };
    return {
        id, user, t, distance,
        x: 100, y: 100, hidden: false,
        fillColor: "#ff4400", borderColor: "#ff4400",
        toObject: jest.fn().mockReturnValue({ ...originalData }),
        delete:   jest.fn().mockResolvedValue(undefined),
        update:   jest.fn().mockResolvedValue(undefined),
    };
}

function openConfigOnMoveTab(templates) {
    setupBar();
    global.canvas.scene.templates.contents = templates;
    document.querySelector(".stp-move-btn").click();
    return openDialogHtml();
}

// ── Star Template Placer (integration) ────────────────────────────────────

describe("Star Template Placer", () => {
    describe("init hook", () => {
        it("registers an init hook", () => {
            expect(global.Hooks.once).toHaveBeenCalledWith("init", expect.any(Function));
        });

        it("registers the barHidden setting with client scope and correct defaults", () => {
            global.game.settings.register.mockClear();
            hookCallbacks["init"]();
            expect(global.game.settings.register).toHaveBeenCalledWith(
                "star-template-placer",
                "barHidden",
                expect.objectContaining({ scope: "client", config: true, type: Boolean, default: false })
            );
        });

        describe("barHidden onChange", () => {
            let onChange;
            beforeEach(() => {
                global.game.settings.register.mockClear();
                hookCallbacks["init"]();
                onChange = global.game.settings.register.mock.calls
                    .find(c => c[1] === "barHidden")[2].onChange;
            });

            it("hides the bar when called with true", () => {
                setupBar();
                onChange(true);
                expect(document.querySelector(".stp-template-bar").style.display).toBe("none");
            });

            it("shows the bar when called with false", () => {
                setupBar({ barHidden: true });
                onChange(false);
                expect(document.querySelector(".stp-template-bar").style.display).not.toBe("none");
            });
        });
    });

    describe("ready hook", () => {
        beforeEach(() => { setupBar(); });

        it("appends the template bar to body", () => {
            expect(document.querySelector(".stp-template-bar")).not.toBeNull();
        });

        it("renders a Place button", () => {
            expect(document.querySelector(".stp-place-btn")).not.toBeNull();
        });

        it("renders a Move button", () => {
            expect(document.querySelector(".stp-move-btn")).not.toBeNull();
        });

        it("renders a config button", () => {
            expect(document.querySelector(".stp-config-btn")).not.toBeNull();
        });

        it("renders a drag handle", () => {
            expect(document.querySelector(".stp-bar-handle")).not.toBeNull();
        });

        it("hides the bar on load when barHidden is true", () => {
            setupBar({ barHidden: true });
            expect(document.querySelector(".stp-template-bar").style.display).toBe("none");
        });

        it("shows the bar on load when barHidden is not set", () => {
            setupBar();
            expect(document.querySelector(".stp-template-bar").style.display).not.toBe("none");
        });
    });

    describe("bar positioning", () => {
        it("applies saved position from barPosition flag", () => {
            setupBar({ barPosition: { left: 200, top: 150 } });
            const bar = document.querySelector(".stp-template-bar");
            expect(bar.style.left).toBe("200px");
            expect(bar.style.top).toBe("150px");
        });

        it("applies a default top of 10px when no barPosition flag is set", () => {
            setupBar();
            expect(document.querySelector(".stp-template-bar").style.top).toBe("10px");
        });

        it("defers position calculation to requestAnimationFrame so outerWidth is accurate", () => {
            let rafCb;
            global.requestAnimationFrame = cb => { rafCb = cb; };
            try {
                setupBar();
                // RAF scheduled but not yet fired — position not yet applied
                const bar = document.querySelector(".stp-template-bar");
                expect(bar.style.left).toBe("");
                expect(bar.style.top).toBe("");
                // After RAF fires, default position is applied
                rafCb();
                expect(bar.style.top).toBe("10px");
            } finally {
                global.requestAnimationFrame = cb => cb();
            }
        });

        it("barHidden hide is also deferred so the bar is visible when outerWidth is measured", () => {
            let rafCb;
            global.requestAnimationFrame = cb => { rafCb = cb; };
            try {
                setupBar({ barHidden: true });
                // Bar should still be visible before RAF fires (so layout can be measured)
                expect(document.querySelector(".stp-template-bar").style.display).not.toBe("none");
                rafCb();
                // After RAF: position applied and bar hidden
                expect(document.querySelector(".stp-template-bar").style.display).toBe("none");
            } finally {
                global.requestAnimationFrame = cb => cb();
            }
        });

        it("saves position to flag on drag end", () => {
            setupBar();
            global.game.user.setFlag.mockClear();
            const handle = document.querySelector(".stp-bar-handle");
            $(handle).trigger({ type: "mousedown", clientX: 50, clientY: 50, preventDefault: () => {} });
            $(document).trigger({ type: "mousemove.stp-drag", clientX: 80, clientY: 70 });
            $(document).trigger("mouseup.stp-drag");
            expect(global.game.user.setFlag).toHaveBeenCalledWith(
                "star-template-placer", "barPosition",
                expect.objectContaining({ left: expect.any(Number), top: expect.any(Number) })
            );
        });
    });

    describe("Place button", () => {
        beforeEach(() => { setupBar(); });

        it("opens a dialog when Place is clicked", () => {
            global.foundry.applications.api.DialogV2.wait.mockClear();
            document.querySelector(".stp-place-btn").click();
            expect(global.foundry.applications.api.DialogV2.wait).toHaveBeenCalled();
        });

        it("dialog has a shape select with circle, cone, ray, and rect", () => {
            document.querySelector(".stp-place-btn").click();
            const { html } = openDialogHtml();
            const options = [...html.find(".stp-type option")].map(o => o.value);
            expect(options).toContain("circle");
            expect(options).toContain("cone");
            expect(options).toContain("ray");
            expect(options).toContain("rect");
        });

        it("dialog has a distance input defaulting to 20", () => {
            document.querySelector(".stp-place-btn").click();
            const { html } = openDialogHtml();
            expect(html.find(".stp-distance").val()).toBe("20");
        });

        it("dialog has a color input", () => {
            document.querySelector(".stp-place-btn").click();
            const { html } = openDialogHtml();
            expect(html.find(".stp-color").length).toBe(1);
        });

        it("cone angle row is hidden by default", () => {
            document.querySelector(".stp-place-btn").click();
            const { html } = openDialogHtml();
            expect(html.find(".stp-cone-row").css("display")).toBe("none");
        });

        it("cone angle row shows when shape is changed to cone", () => {
            document.querySelector(".stp-place-btn").click();
            const { html } = openDialogHtml();
            html.find(".stp-type").val("cone").trigger("change");
            expect(html.find(".stp-cone-row").css("display")).not.toBe("none");
        });

        it("cone angle row hides again when shape is changed away from cone", () => {
            document.querySelector(".stp-place-btn").click();
            const { html } = openDialogHtml();
            html.find(".stp-type").val("cone").trigger("change");
            html.find(".stp-type").val("circle").trigger("change");
            expect(html.find(".stp-cone-row").css("display")).toBe("none");
        });

        it("width row is hidden by default", () => {
            document.querySelector(".stp-place-btn").click();
            const { html } = openDialogHtml();
            expect(html.find(".stp-width-row").css("display")).toBe("none");
        });

        it("width row shows when shape is changed to ray", () => {
            document.querySelector(".stp-place-btn").click();
            const { html } = openDialogHtml();
            html.find(".stp-type").val("ray").trigger("change");
            expect(html.find(".stp-width-row").css("display")).not.toBe("none");
        });

        it("width row shows when shape is changed to rect", () => {
            document.querySelector(".stp-place-btn").click();
            const { html } = openDialogHtml();
            html.find(".stp-type").val("rect").trigger("change");
            expect(html.find(".stp-width-row").css("display")).not.toBe("none");
        });

        it("height row is hidden by default", () => {
            document.querySelector(".stp-place-btn").click();
            const { html } = openDialogHtml();
            expect(html.find(".stp-height-row").css("display")).toBe("none");
        });

        it("height row shows when shape is changed to rect", () => {
            document.querySelector(".stp-place-btn").click();
            const { html } = openDialogHtml();
            html.find(".stp-type").val("rect").trigger("change");
            expect(html.find(".stp-height-row").css("display")).not.toBe("none");
        });

        it("height row hides when shape is changed away from rect", () => {
            document.querySelector(".stp-place-btn").click();
            const { html } = openDialogHtml();
            html.find(".stp-type").val("rect").trigger("change");
            html.find(".stp-type").val("circle").trigger("change");
            expect(html.find(".stp-height-row").css("display")).toBe("none");
        });

        it("size row is hidden when shape is rect", () => {
            document.querySelector(".stp-place-btn").click();
            const { html } = openDialogHtml();
            html.find(".stp-type").val("rect").trigger("change");
            expect(html.find(".stp-distance-row").css("display")).toBe("none");
        });

        it("size row is visible when shape is changed away from rect", () => {
            document.querySelector(".stp-place-btn").click();
            const { html } = openDialogHtml();
            html.find(".stp-type").val("rect").trigger("change");
            html.find(".stp-type").val("circle").trigger("change");
            expect(html.find(".stp-distance-row").css("display")).not.toBe("none");
        });

        it("width row hides again when shape is changed away from ray", () => {
            document.querySelector(".stp-place-btn").click();
            const { html } = openDialogHtml();
            html.find(".stp-type").val("ray").trigger("change");
            html.find(".stp-type").val("circle").trigger("change");
            expect(html.find(".stp-width-row").css("display")).toBe("none");
        });

        it("width row hides again when shape is changed away from rect", () => {
            document.querySelector(".stp-place-btn").click();
            const { html } = openDialogHtml();
            html.find(".stp-type").val("rect").trigger("change");
            html.find(".stp-type").val("circle").trigger("change");
            expect(html.find(".stp-width-row").css("display")).toBe("none");
        });

        it("passes width to createEmbeddedDocuments for ray", async () => {
            await triggerPlaceFromDialog(html => {
                html.find(".stp-type").val("ray").trigger("change");
                html.find(".stp-width").val("30");
            });
            expect(global.canvas.scene.createEmbeddedDocuments).toHaveBeenCalledWith(
                "MeasuredTemplate",
                [expect.objectContaining({ t: "ray", width: 30 })]
            );
        });

        it("passes width and height * sqrt(2) for rect distance and stores dimensions in flags", async () => {
            await triggerPlaceFromDialog(html => {
                html.find(".stp-type").val("rect").trigger("change");
                html.find(".stp-width").val("30");
                html.find(".stp-height").val("40");
            });
            expect(global.canvas.scene.createEmbeddedDocuments).toHaveBeenCalledWith(
                "MeasuredTemplate",
                [expect.objectContaining({
                    t: "rect",
                    width: 30,
                    distance: 40 * Math.SQRT2,
                    flags: expect.objectContaining({
                        "star-template-placer": expect.objectContaining({ width: 30, height: 40 })
                    })
                })]
            );
        });

        it("Place button registers a canvas click listener for placement", async () => {
            document.querySelector(".stp-place-btn").click();
            const { options } = openDialogHtml();
            const container = global.foundry.applications.api.DialogV2.__lastInstance.element;
            const placeBtn  = options.buttons.find(b => b.action === "place");
            placeBtn.callback(null, null, { element: container });
            global.foundry.applications.api.DialogV2.__resolveDialog("place");
            await new Promise(r => setTimeout(r, 0));
            expect(window.addEventListener).toHaveBeenCalledWith(
                "pointerdown", expect.any(Function), { capture: true }
            );
        });

        it("adds a preview object to canvas.templates.preview while waiting for placement", async () => {
            document.querySelector(".stp-place-btn").click();
            const { options } = openDialogHtml();
            const container = global.foundry.applications.api.DialogV2.__lastInstance.element;
            const placeBtn  = options.buttons.find(b => b.action === "place");
            placeBtn.callback(null, null, { element: container });
            global.foundry.applications.api.DialogV2.__resolveDialog("place");
            await new Promise(r => setTimeout(r, 0));
            expect(global.canvas.templates.preview.addChild).toHaveBeenCalled();
        });

        it("preview document includes width and height * sqrt(2) as distance for rect", async () => {
            document.querySelector(".stp-place-btn").click();
            const { options } = openDialogHtml();
            const container = global.foundry.applications.api.DialogV2.__lastInstance.element;
            $(container).find(".stp-type").val("rect").trigger("change");
            $(container).find(".stp-width").val("30");
            $(container).find(".stp-height").val("40");
            global.CONFIG.MeasuredTemplate.documentClass.mockClear();
            const placeBtn = options.buttons.find(b => b.action === "place");
            placeBtn.callback(null, null, { element: container });
            global.foundry.applications.api.DialogV2.__resolveDialog("place");
            await new Promise(r => setTimeout(r, 0));
            expect(global.CONFIG.MeasuredTemplate.documentClass).toHaveBeenCalledWith(
                expect.objectContaining({ t: "rect", width: 30, distance: 40 * Math.SQRT2 }), expect.anything()
            );
        });

        it("preview document includes width for ray", async () => {
            document.querySelector(".stp-place-btn").click();
            const { options } = openDialogHtml();
            const container = global.foundry.applications.api.DialogV2.__lastInstance.element;
            $(container).find(".stp-type").val("ray").trigger("change");
            $(container).find(".stp-width").val("10");
            global.CONFIG.MeasuredTemplate.documentClass.mockClear();
            const placeBtn = options.buttons.find(b => b.action === "place");
            placeBtn.callback(null, null, { element: container });
            global.foundry.applications.api.DialogV2.__resolveDialog("place");
            await new Promise(r => setTimeout(r, 0));
            expect(global.CONFIG.MeasuredTemplate.documentClass).toHaveBeenCalledWith(
                expect.objectContaining({ t: "ray", width: 10 }), expect.anything()
            );
        });

        it("removes the preview object after the canvas is clicked", async () => {
            await triggerPlaceFromDialog();
            expect(global.canvas.templates.preview.removeChild).toHaveBeenCalled();
        });

        it("updates the preview position on pointermove", async () => {
            document.querySelector(".stp-place-btn").click();
            const { options } = openDialogHtml();
            const container = global.foundry.applications.api.DialogV2.__lastInstance.element;
            const placeBtn  = options.buttons.find(b => b.action === "place");
            placeBtn.callback(null, null, { element: container });
            global.foundry.applications.api.DialogV2.__resolveDialog("place");
            await new Promise(r => setTimeout(r, 0));

            global.canvas.mousePosition = { x: 200, y: 100 };
            const moveCalls = global.canvas.app.view.addEventListener.mock.calls
                .filter(c => c[0] === "pointermove");
            const moveHandler = moveCalls[moveCalls.length - 1]?.[1];
            moveHandler?.();

            expect(mockTemplateObject.document.updateSource).toHaveBeenCalledWith(
                expect.objectContaining({ x: 200, y: 100 })
            );
            expect(mockTemplateObject.refresh).toHaveBeenCalled();
        });

        it("creates the template at canvas.mousePosition when the canvas is clicked", async () => {
            global.canvas.mousePosition = { x: 300, y: 150 };
            await triggerPlaceFromDialog();
            expect(global.canvas.scene.createEmbeddedDocuments).toHaveBeenCalledWith(
                "MeasuredTemplate",
                [expect.objectContaining({ t: "circle", x: 300, y: 150 })]
            );
        });

        it("clamps distance to minimum 5", async () => {
            await triggerPlaceFromDialog(html => html.find(".stp-distance").val("-10"));
            expect(global.canvas.scene.createEmbeddedDocuments).toHaveBeenCalledWith(
                "MeasuredTemplate",
                [expect.objectContaining({ distance: 5 })]
            );
        });

        it("warns and does not register a listener when canvas.scene is null", async () => {
            const originalScene = global.canvas.scene;
            global.canvas.scene = null;
            global.ui.notifications.warn.mockClear();
            document.querySelector(".stp-place-btn").click();
            const { options } = openDialogHtml();
            const container = global.foundry.applications.api.DialogV2.__lastInstance.element;
            const placeBtn  = options.buttons.find(b => b.action === "place");
            placeBtn.callback(null, null, { element: container });
            global.foundry.applications.api.DialogV2.__resolveDialog("place");
            await new Promise(r => setTimeout(r, 0));
            expect(global.ui.notifications.warn).toHaveBeenCalledWith(
                expect.stringContaining("No active scene")
            );
            expect(window.addEventListener).not.toHaveBeenCalledWith(
                "pointerdown", expect.any(Function), expect.anything()
            );
            global.canvas.scene = originalScene;
        });

        it("dialog title is 'Place Template'", () => {
            document.querySelector(".stp-place-btn").click();
            const options = global.foundry.applications.api.DialogV2.__lastOptions;
            expect(options.window.title).toBe("Place Template");
        });
    });

    describe("Move button", () => {
        beforeEach(() => { setupBar(); });

        it("warns when there are no templates to move", async () => {
            global.ui.notifications.warn.mockClear();
            global.canvas.scene.templates.contents = [];
            document.querySelector(".stp-move-btn").click();
            await new Promise(r => setTimeout(r, 0));
            expect(global.ui.notifications.warn).toHaveBeenCalledWith(
                expect.stringContaining("No templates to move")
            );
        });

        it("warns when canvas.scene is null", async () => {
            const originalScene = global.canvas.scene;
            global.canvas.scene = null;
            global.ui.notifications.warn.mockClear();
            document.querySelector(".stp-move-btn").click();
            await new Promise(r => setTimeout(r, 0));
            expect(global.ui.notifications.warn).toHaveBeenCalledWith(
                expect.stringContaining("No active scene")
            );
            global.canvas.scene = originalScene;
        });

        it("does not open a dialog when there are no templates", async () => {
            global.foundry.applications.api.DialogV2.wait.mockClear();
            global.canvas.scene.templates.contents = [];
            document.querySelector(".stp-move-btn").click();
            await new Promise(r => setTimeout(r, 0));
            expect(global.foundry.applications.api.DialogV2.wait).not.toHaveBeenCalled();
        });

        it("opens the config dialog when templates exist", () => {
            global.foundry.applications.api.DialogV2.wait.mockClear();
            global.canvas.scene.templates.contents = [makeTemplate("t1", "user-001", "circle", 4)];
            document.querySelector(".stp-move-btn").click();
            expect(global.foundry.applications.api.DialogV2.wait).toHaveBeenCalled();
        });

        it("opens with the Move tab active", () => {
            const { html } = openConfigOnMoveTab([makeTemplate("t1", "user-001", "circle", 4)]);
            expect(html.find(".stp-tab.stp-tab-active").data("tab")).toBe("move");
        });

        it("Move tab panel is visible on open", () => {
            const { html } = openConfigOnMoveTab([makeTemplate("t1", "user-001", "circle", 4)]);
            expect(html.find("[data-panel='move']").hasClass("stp-tab-panel-hidden")).toBe(false);
        });

        describe("move tab content", () => {
            it("shows one row per scene template", () => {
                const { html } = openConfigOnMoveTab([
                    makeTemplate("t1", "user-001", "circle", 4),
                    makeTemplate("t2", "user-001", "cone",   6),
                ]);
                expect(html.find('[data-panel="move"] tbody tr[data-id]')).toHaveLength(2);
            });

            it("shows the template name from flags when present", () => {
                const tpl = makeTemplate("t1", "user-001", "circle", 4);
                tpl.flags = { "star-template-placer": { name: "Fireball" } };
                const { html } = openConfigOnMoveTab([tpl]);
                expect(html.find('[data-panel="move"] tbody td').eq(0).text()).toBe("Fireball");
            });

            it("shows empty name when no flag name is set", () => {
                const { html } = openConfigOnMoveTab([makeTemplate("t1", "user-001", "circle", 4)]);
                expect(html.find('[data-panel="move"] tbody td').eq(0).text()).toBe("");
            });

            it("shows the owner name via game.users", () => {
                global.game.users.get.mockReturnValue({ name: "Gandalf" });
                const { html } = openConfigOnMoveTab([makeTemplate("t1", "user-001", "circle", 4)]);
                expect(html.find('[data-panel="move"] tbody td').eq(1).text()).toBe("Gandalf");
            });

            it("shows the owner name when t.user is a User document (Foundry v14)", () => {
                const tpl = makeTemplate("t1", "user-001", "circle", 4);
                tpl.user = { name: "Gamemaster" };
                const { html } = openConfigOnMoveTab([tpl]);
                expect(html.find('[data-panel="move"] tbody td').eq(1).text()).toBe("Gamemaster");
            });

            it("shows 'Unknown' when neither author nor game.users resolves", () => {
                global.game.users.get.mockReturnValue(undefined);
                const { html } = openConfigOnMoveTab([makeTemplate("t1", "user-999", "circle", 4)]);
                expect(html.find('[data-panel="move"] tbody td').eq(1).text()).toBe("Unknown");
            });

            it("shows the template type", () => {
                const { html } = openConfigOnMoveTab([makeTemplate("t1", "user-001", "cone", 4)]);
                expect(html.find('[data-panel="move"] tbody td').eq(2).text()).toBe("cone");
            });

            it("shows a color swatch with the template fill color", () => {
                const { html } = openConfigOnMoveTab([makeTemplate("t1", "user-001", "circle", 4)]);
                const swatch = html.find('[data-panel="move"] .stp-color-swatch');
                expect(swatch).toHaveLength(1);
                expect(swatch.attr("style")).toContain("#ff4400");
            });

            it("divides stored distance by grid.size/20 to display feet", () => {
                // stored distance = 100, gridDist = (100/20) = 5 → 100/5 = 20ft
                const { html } = openConfigOnMoveTab([makeTemplate("t1", "user-001", "circle", 100)]);
                expect(html.find('[data-panel="move"] tbody td').eq(3).text()).toBe("20ft");
            });

            it("shows distance × width for ray templates from template data", () => {
                // stored distance=100 → gridDist=5 → 20ft; stored width=100 → gridWidthScale=20 → 5ft
                const tpl = makeTemplate("t1", "user-001", "ray", 100);
                tpl.width = 100;
                const { html } = openConfigOnMoveTab([tpl]);
                expect(html.find('[data-panel="move"] tbody td').eq(3).text()).toBe("20ft × 5ft");
            });

            it("ray with width=0 shows 0ft width, not distance", () => {
                // width=0 should not fall back to distance (that's only for rects)
                const tpl = makeTemplate("t1", "user-001", "ray", 100);
                tpl.width = 0;
                const { html } = openConfigOnMoveTab([tpl]);
                expect(html.find('[data-panel="move"] tbody td').eq(3).text()).toBe("20ft × 0ft");
            });

            it("shows distance × width for ray templates from flags", () => {
                const tpl = makeTemplate("t1", "user-001", "ray", 4);
                tpl.flags = { "star-template-placer": { distance: 100, width: 5 } };
                const { html } = openConfigOnMoveTab([tpl]);
                expect(html.find('[data-panel="move"] tbody td').eq(3).text()).toBe("100ft × 5ft");
            });

            it("shows width × height for rect from flags in the move tab", () => {
                const tpl = makeTemplate("t1", "user-001", "rect", 5);
                tpl.flags = { "star-template-placer": { width: 30, height: 40 } };
                const { html } = openConfigOnMoveTab([tpl]);
                expect(html.find('[data-panel="move"] tbody td').eq(3).text()).toBe("30ft × 40ft");
            });

            it("shows computed distance for rect when flags are absent", () => {
                // stored=100, gridDist=5 → 20ft; direction=0 so no √2 correction
                const tpl = makeTemplate("t1", "user-001", "rect", 100);
                const { html } = openConfigOnMoveTab([tpl]);
                expect(html.find('[data-panel="move"] tbody td').eq(3).text()).toBe("20ft");
            });

            it("shows side length for direction-45 rect when flags are absent", () => {
                // stored=100, gridDist=5 → dist=20 → side=round(20/√2)=14ft
                const tpl = makeTemplate("t1", "user-001", "rect", 100);
                tpl.direction = 45;
                const { html } = openConfigOnMoveTab([tpl]);
                expect(html.find('[data-panel="move"] tbody td').eq(3).text()).toBe(
                    `${Math.round(20 / Math.SQRT2)}ft`
                );
            });

            it("shows angle in degrees for cone templates", () => {
                const tpl = makeTemplate("t1", "user-001", "cone", 4);
                tpl.angle = 90;
                const { html } = openConfigOnMoveTab([tpl]);
                expect(html.find('[data-panel="move"] tbody td').eq(4).text()).toBe("90°");
            });

            it("shows dash for angle when template is not a cone", () => {
                const { html } = openConfigOnMoveTab([makeTemplate("t1", "user-001", "circle", 4)]);
                expect(html.find('[data-panel="move"] tbody td').eq(4).text()).toBe("—");
            });

            it("shows an empty state message when there are no templates", () => {
                setupBar();
                global.canvas.scene.templates.contents = [];
                document.querySelector(".stp-config-btn").click();
                const { html } = openDialogHtml();
                html.find("[data-tab='move']").trigger("click");
                expect(html.find(".stp-move-empty").length).toBe(1);
            });

            it("each row has a delete button", () => {
                const { html } = openConfigOnMoveTab([
                    makeTemplate("t1", "user-001", "circle", 4),
                    makeTemplate("t2", "user-001", "circle", 4),
                ]);
                expect(html.find(".stp-remove-template-btn")).toHaveLength(2);
            });

            it("each row has an edit/move button", () => {
                const { html } = openConfigOnMoveTab([
                    makeTemplate("t1", "user-001", "circle", 4),
                    makeTemplate("t2", "user-001", "circle", 4),
                ]);
                expect(html.find(".stp-move-template-btn")).toHaveLength(2);
            });

            it("hides the template immediately when delete button is clicked", async () => {
                const tpl = makeTemplate("t1", "user-001", "circle", 4);
                const { html } = openConfigOnMoveTab([tpl]);
                html.find(".stp-remove-template-btn").eq(0).trigger("click");
                await new Promise(r => setTimeout(r, 0));
                expect(global.canvas.scene.updateEmbeddedDocuments).toHaveBeenCalledWith(
                    "MeasuredTemplate", [expect.objectContaining({ _id: "t1", hidden: true })]
                );
            });

            it("does not delete the template immediately when delete button is clicked", async () => {
                const tpl = makeTemplate("t1", "user-001", "circle", 4);
                const { html } = openConfigOnMoveTab([tpl]);
                html.find(".stp-remove-template-btn").eq(0).trigger("click");
                await new Promise(r => setTimeout(r, 0));
                expect(global.canvas.scene.deleteEmbeddedDocuments).not.toHaveBeenCalled();
            });

            async function deleteAndCancel(tpl) {
                openConfigOnMoveTab([tpl]);
                const localHtml = $(global.foundry.applications.api.DialogV2.__lastInstance.element);
                localHtml.find(".stp-remove-template-btn").eq(0).trigger("click");
                await new Promise(r => setTimeout(r, 0));
                global.canvas.scene.updateEmbeddedDocuments.mockClear();
                global.foundry.applications.api.DialogV2.__resolveDialog(null);
                await new Promise(r => setTimeout(r, 0));
            }

            it("restores original hidden state on Cancel (was visible)", async () => {
                const tpl = makeTemplate("t1", "user-001", "circle", 4);
                await deleteAndCancel(tpl);
                expect(global.canvas.scene.updateEmbeddedDocuments).toHaveBeenCalledWith(
                    "MeasuredTemplate", [expect.objectContaining({ _id: "t1", hidden: false })]
                );
            });

            it("restores original hidden state on Cancel (was already hidden)", async () => {
                const tpl = makeTemplate("t1", "user-001", "circle", 4);
                tpl.hidden = true;
                await deleteAndCancel(tpl);
                expect(global.canvas.scene.updateEmbeddedDocuments).toHaveBeenCalledWith(
                    "MeasuredTemplate", [expect.objectContaining({ _id: "t1", hidden: true })]
                );
            });

            it("actually deletes the template when Save is clicked", async () => {
                const tpl = makeTemplate("t1", "user-001", "circle", 4);
                const { html, options } = openConfigOnMoveTab([tpl]);
                html.find(".stp-remove-template-btn").eq(0).trigger("click");
                await new Promise(r => setTimeout(r, 0));
                const container = global.foundry.applications.api.DialogV2.__lastInstance.element;
                const saveBtn = options.buttons.find(b => b.action === "save");
                await saveBtn.callback(null, null, { element: container });
                expect(global.canvas.scene.deleteEmbeddedDocuments).toHaveBeenCalledWith(
                    "MeasuredTemplate", ["t1"]
                );
            });

            it("pending-deleted template does not reappear when Move tab is re-entered", async () => {
                const tpl = makeTemplate("t1", "user-001", "circle", 4);
                const { html } = openConfigOnMoveTab([tpl]);
                html.find(".stp-remove-template-btn").eq(0).trigger("click");
                html.find("[data-tab='templates']").trigger("click");
                html.find("[data-tab='move']").trigger("click");
                expect(html.find('[data-panel="move"] tbody tr[data-id]')).toHaveLength(0);
                expect(html.find(".stp-move-empty").length).toBe(1);
            });

            it("removes the row from the table after delete", async () => {
                const { html } = openConfigOnMoveTab([makeTemplate("t1", "user-001", "circle", 4)]);
                html.find(".stp-remove-template-btn").eq(0).trigger("click");
                await new Promise(r => setTimeout(r, 0));
                expect(html.find('[data-panel="move"] tbody tr[data-id]')).toHaveLength(0);
            });

            it("shows empty state when last template is deleted", async () => {
                const { html } = openConfigOnMoveTab([makeTemplate("t1", "user-001", "circle", 4)]);
                html.find(".stp-remove-template-btn").eq(0).trigger("click");
                await new Promise(r => setTimeout(r, 0));
                expect(html.find(".stp-move-empty").length).toBe(1);
            });

            it("only removes the clicked row, leaving others", async () => {
                const { html } = openConfigOnMoveTab([
                    makeTemplate("t1", "user-001", "circle", 4),
                    makeTemplate("t2", "user-001", "circle", 6),
                ]);
                html.find(".stp-remove-template-btn").eq(0).trigger("click");
                await new Promise(r => setTimeout(r, 0));
                expect(html.find('[data-panel="move"] tbody tr[data-id]')).toHaveLength(1);
                expect(html.find('[data-panel="move"] tbody tr[data-id="t2"]')).toHaveLength(1);
            });

            it("still removes the row when the template is already gone from the scene", async () => {
                const tpl = makeTemplate("t1", "user-001", "circle", 4);
                const { html } = openConfigOnMoveTab([tpl]);
                global.canvas.scene.templates.get.mockReturnValue(undefined);
                html.find(".stp-remove-template-btn").eq(0).trigger("click");
                await new Promise(r => setTimeout(r, 0));
                expect(html.find('[data-panel="move"] tbody tr[data-id]')).toHaveLength(0);
                expect(global.canvas.scene.updateEmbeddedDocuments).not.toHaveBeenCalledWith(
                    "MeasuredTemplate", [expect.objectContaining({ hidden: true })]
                );
            });

            describe("XSS in template data", () => {
                it("does not execute a script tag in the owner name", () => {
                    window.__xssOwner = undefined;
                    global.game.users.get.mockReturnValue({ name: "<script>window.__xssOwner=true</script>" });
                    openConfigOnMoveTab([makeTemplate("t1", "user-001", "circle", 4)]);
                    expect(window.__xssOwner).toBeUndefined();
                });

                it("does not execute a script tag in the template type", () => {
                    window.__xssType = undefined;
                    openConfigOnMoveTab([makeTemplate("t1", "user-001", "<script>window.__xssType=true</script>", 4)]);
                    expect(window.__xssType).toBeUndefined();
                });
            });
        });

        describe("edit/move button", () => {
            it("clicking the move button closes the config dialog", async () => {
                const tpl = makeTemplate("t1", "user-001", "circle", 4);
                const { html } = openConfigOnMoveTab([tpl]);
                const instance = global.foundry.applications.api.DialogV2.__lastInstance;
                html.find(".stp-move-template-btn").eq(0).trigger("click");
                expect(instance.close).toHaveBeenCalled();
            });

            it("after clicking the move button, a canvas pointerdown listener is registered", async () => {
                const tpl = makeTemplate("t1", "user-001", "circle", 4);
                openConfigOnMoveTab([tpl]);
                window.addEventListener.mockClear();
                const localHtml = $(global.foundry.applications.api.DialogV2.__lastInstance.element);
                localHtml.find(".stp-move-template-btn").eq(0).trigger("click");
                // Close resolves the dialog promise
                await new Promise(r => setTimeout(r, 0));
                await new Promise(r => setTimeout(r, 0));
                expect(window.addEventListener).toHaveBeenCalledWith(
                    "pointerdown", expect.any(Function), { capture: true }
                );
            });

            it("after canvas click following a move, the config dialog reopens on the move tab", async () => {
                const tpl = makeTemplate("t1", "user-001", "circle", 4);
                openConfigOnMoveTab([tpl]);
                global.foundry.applications.api.DialogV2.wait.mockClear();
                const localHtml = $(global.foundry.applications.api.DialogV2.__lastInstance.element);
                localHtml.find(".stp-move-template-btn").eq(0).trigger("click");
                await new Promise(r => setTimeout(r, 0));
                await simulateCanvasClick();
                await new Promise(r => setTimeout(r, 0));
                expect(global.foundry.applications.api.DialogV2.wait).toHaveBeenCalled();
                const lastOptions = global.foundry.applications.api.DialogV2.__lastOptions;
                const reopened = document.createElement("div");
                reopened.innerHTML = lastOptions.content;
                expect($(reopened).find(".stp-tab.stp-tab-active").data("tab")).toBe("move");
            });

            it("canvas click immediately moves the template to the new position", async () => {
                global.canvas.mousePosition = { x: 300, y: 250 };
                const tpl = makeTemplate("t1", "user-001", "circle", 4);
                openConfigOnMoveTab([tpl]);
                const localHtml = $(global.foundry.applications.api.DialogV2.__lastInstance.element);
                localHtml.find(".stp-move-template-btn").eq(0).trigger("click");
                await new Promise(r => setTimeout(r, 0));
                await simulateCanvasClick();
                await new Promise(r => setTimeout(r, 0));
                expect(global.canvas.scene.deleteEmbeddedDocuments).toHaveBeenCalledWith(
                    "MeasuredTemplate", ["t1"]
                );
                expect(global.canvas.scene.createEmbeddedDocuments).toHaveBeenCalledWith(
                    "MeasuredTemplate", [expect.objectContaining({ x: 300, y: 250 })]
                );
            });

            it("moving a non-module direction-45 rect injects side-length flags", async () => {
                global.canvas.mousePosition = { x: 300, y: 250 };
                // stored distance=100 → gridDist=5 → input=20 → side = round(20/√2) = 14
                const tpl = makeTemplate("t1", "user-001", "rect", 100);
                tpl.toObject.mockReturnValue({
                    t: "rect", distance: 100, width: 0, direction: 45,
                    x: 100, y: 100, fillColor: "#ff4400", borderColor: "#ff4400",
                    flags: {},
                });
                openConfigOnMoveTab([tpl]);
                const localHtml = $(global.foundry.applications.api.DialogV2.__lastInstance.element);
                localHtml.find(".stp-move-template-btn").eq(0).trigger("click");
                await new Promise(r => setTimeout(r, 0));
                await simulateCanvasClick();
                await new Promise(r => setTimeout(r, 0));
                const side = Math.round((100 / 5) / Math.SQRT2); // 14
                expect(global.canvas.scene.createEmbeddedDocuments).toHaveBeenCalledWith(
                    "MeasuredTemplate",
                    [expect.objectContaining({
                        flags: expect.objectContaining({
                            "star-template-placer": expect.objectContaining({
                                width: side, height: side, _nonModuleRect: true,
                            }),
                        }),
                    })]
                );
            });

            it("moving a non-module ray divides width by gridWidthScale (size/distance)", async () => {
                global.canvas.mousePosition = { x: 300, y: 250 };
                // grid.size=100, grid.distance=5 → gridWidthScale=20; stored width=100 → passes 100/20=5
                const tpl = makeTemplate("t1", "user-001", "ray", 500);
                tpl.toObject.mockReturnValue({
                    t: "ray", distance: 500, width: 100, direction: 0,
                    x: 100, y: 100, fillColor: "#ff4400", borderColor: "#ff4400",
                    flags: {},
                });
                openConfigOnMoveTab([tpl]);
                const localHtml = $(global.foundry.applications.api.DialogV2.__lastInstance.element);
                localHtml.find(".stp-move-template-btn").eq(0).trigger("click");
                await new Promise(r => setTimeout(r, 0));
                await simulateCanvasClick();
                await new Promise(r => setTimeout(r, 0));
                expect(global.canvas.scene.createEmbeddedDocuments).toHaveBeenCalledWith(
                    "MeasuredTemplate",
                    [expect.objectContaining({ t: "ray", distance: 100, width: 5 })]
                );
            });

            it("moving a non-module ray stores distance and width as module flags", async () => {
                global.canvas.mousePosition = { x: 300, y: 250 };
                // distance=500→100ft, width=100→5ft; stored flags should have {distance:100,width:5,_nonModule:true}
                const tpl = makeTemplate("t1", "user-001", "ray", 500);
                tpl.toObject.mockReturnValue({
                    t: "ray", distance: 500, width: 100, direction: 0,
                    x: 100, y: 100, fillColor: "#ff4400", borderColor: "#ff4400",
                    flags: {},
                });
                openConfigOnMoveTab([tpl]);
                const localHtml = $(global.foundry.applications.api.DialogV2.__lastInstance.element);
                localHtml.find(".stp-move-template-btn").eq(0).trigger("click");
                await new Promise(r => setTimeout(r, 0));
                await simulateCanvasClick();
                await new Promise(r => setTimeout(r, 0));
                expect(global.canvas.scene.createEmbeddedDocuments).toHaveBeenCalledWith(
                    "MeasuredTemplate",
                    [expect.objectContaining({
                        flags: expect.objectContaining({
                            "star-template-placer": expect.objectContaining({
                                distance: 100, width: 5, _nonModule: true,
                            }),
                        }),
                    })]
                );
            });

            it("moving a non-module circle stores distance as module flags", async () => {
                global.canvas.mousePosition = { x: 300, y: 250 };
                // distance=20→4ft (20/5=4); stored flags should have {distance:4,_nonModule:true}
                const tpl = makeTemplate("t1", "user-001", "circle", 20);
                tpl.toObject.mockReturnValue({
                    t: "circle", distance: 20, width: 0, direction: 0,
                    x: 100, y: 100, fillColor: "#ff4400", borderColor: "#ff4400",
                    flags: {},
                });
                openConfigOnMoveTab([tpl]);
                const localHtml = $(global.foundry.applications.api.DialogV2.__lastInstance.element);
                localHtml.find(".stp-move-template-btn").eq(0).trigger("click");
                await new Promise(r => setTimeout(r, 0));
                await simulateCanvasClick();
                await new Promise(r => setTimeout(r, 0));
                expect(global.canvas.scene.createEmbeddedDocuments).toHaveBeenCalledWith(
                    "MeasuredTemplate",
                    [expect.objectContaining({
                        flags: expect.objectContaining({
                            "star-template-placer": expect.objectContaining({
                                distance: 4, _nonModule: true,
                            }),
                        }),
                    })]
                );
            });

            it("_nonModule flag prevents module path from clamping width to 5ft minimum", async () => {
                global.canvas.mousePosition = { x: 300, y: 250 };
                // Template already has _nonModule flag with width=2 (less than 5ft minimum).
                // The non-module path must be taken so width=2 is preserved.
                const tpl = makeTemplate("t1", "user-001", "ray", 500);
                tpl.toObject.mockReturnValue({
                    t: "ray", distance: 500, width: 40, direction: 0,
                    x: 100, y: 100, fillColor: "#ff4400", borderColor: "#ff4400",
                    flags: { "star-template-placer": { distance: 100, width: 2, _nonModule: true } },
                });
                openConfigOnMoveTab([tpl]);
                const localHtml = $(global.foundry.applications.api.DialogV2.__lastInstance.element);
                localHtml.find(".stp-move-template-btn").eq(0).trigger("click");
                await new Promise(r => setTimeout(r, 0));
                await simulateCanvasClick();
                await new Promise(r => setTimeout(r, 0));
                // width=40 stored → 40/20=2ft passed (not clamped to 5)
                expect(global.canvas.scene.createEmbeddedDocuments).toHaveBeenCalledWith(
                    "MeasuredTemplate",
                    [expect.objectContaining({ width: 2 })]
                );
            });

            it("on Save after a move, the template remains at the new position", async () => {
                global.canvas.mousePosition = { x: 300, y: 250 };
                const tpl = makeTemplate("t1", "user-001", "circle", 4);
                openConfigOnMoveTab([tpl]);
                const localHtml = $(global.foundry.applications.api.DialogV2.__lastInstance.element);
                localHtml.find(".stp-move-template-btn").eq(0).trigger("click");
                await new Promise(r => setTimeout(r, 0));
                await simulateCanvasClick();
                await new Promise(r => setTimeout(r, 0));
                // Second dialog is open; click Save
                const options2 = global.foundry.applications.api.DialogV2.__lastOptions;
                const inst2    = global.foundry.applications.api.DialogV2.__lastInstance;
                const container2 = document.createElement("div");
                container2.innerHTML = options2.content;
                inst2.element = container2;
                const saveBtn = options2.buttons.find(b => b.action === "save");
                await saveBtn.callback(null, null, { element: container2 });
                // update was called during canvas click; Save does not call it again with original
                expect(global.canvas.scene.updateEmbeddedDocuments).not.toHaveBeenLastCalledWith(
                    "MeasuredTemplate", [expect.objectContaining({ x: 100, y: 100 })]
                );
            });

            it("on Cancel after picking a move position, original position is restored", async () => {
                global.canvas.mousePosition = { x: 300, y: 250 };
                const tpl = makeTemplate("t1", "user-001", "circle", 4);
                openConfigOnMoveTab([tpl]);
                const localHtml = $(global.foundry.applications.api.DialogV2.__lastInstance.element);
                localHtml.find(".stp-move-template-btn").eq(0).trigger("click");
                await new Promise(r => setTimeout(r, 0));
                await simulateCanvasClick();
                await new Promise(r => setTimeout(r, 0));
                // Second dialog is open; click Cancel
                global.foundry.applications.api.DialogV2.__resolveDialog(null);
                await new Promise(r => setTimeout(r, 0));
                // The moved template should be deleted and the original data recreated
                expect(global.canvas.scene.deleteEmbeddedDocuments).toHaveBeenLastCalledWith(
                    "MeasuredTemplate", ["created-1"]
                );
                expect(global.canvas.scene.createEmbeddedDocuments).toHaveBeenLastCalledWith(
                    "MeasuredTemplate", [expect.objectContaining({ x: 100, y: 100 })]
                );
            });

            it("preview uses module flag dimensions when flags are present", async () => {
                const tpl = makeTemplate("t1", "user-001", "circle", 4);
                tpl.toObject.mockReturnValue({
                    t: "circle", distance: 4, x: 100, y: 100,
                    fillColor: "#ff4400", borderColor: "#ff4400",
                    flags: { "star-template-placer": { distance: 30 } },
                });
                openConfigOnMoveTab([tpl]);
                global.CONFIG.MeasuredTemplate.documentClass.mockClear();
                const localHtml = $(global.foundry.applications.api.DialogV2.__lastInstance.element);
                localHtml.find(".stp-move-template-btn").eq(0).trigger("click");
                await new Promise(r => setTimeout(r, 0));
                await new Promise(r => setTimeout(r, 0));
                expect(global.CONFIG.MeasuredTemplate.documentClass).toHaveBeenCalledWith(
                    expect.objectContaining({ t: "circle", distance: 30 }), expect.anything()
                );
            });

            it("preview for rect uses flag width and height × SQRT2 as distance", async () => {
                const tpl = makeTemplate("t1", "user-001", "rect", 999);
                tpl.toObject.mockReturnValue({
                    t: "rect", distance: 999, width: 999, direction: 45, x: 100, y: 100,
                    fillColor: "#ff4400", borderColor: "#ff4400",
                    flags: { "star-template-placer": { width: 30, height: 40 } },
                });
                openConfigOnMoveTab([tpl]);
                global.CONFIG.MeasuredTemplate.documentClass.mockClear();
                const localHtml = $(global.foundry.applications.api.DialogV2.__lastInstance.element);
                localHtml.find(".stp-move-template-btn").eq(0).trigger("click");
                await new Promise(r => setTimeout(r, 0));
                await new Promise(r => setTimeout(r, 0));
                expect(global.CONFIG.MeasuredTemplate.documentClass).toHaveBeenCalledWith(
                    expect.objectContaining({ t: "rect", width: 30, distance: 40 * Math.SQRT2 }),
                    expect.anything()
                );
            });

            it("preview corrects v14 scaling for non-module templates", async () => {
                // Stored distance=7 with grid.size=100 → gridDist=5 → preview distance=7/5=1.4
                const tpl = makeTemplate("t1", "user-001", "circle", 7);
                openConfigOnMoveTab([tpl]);
                global.CONFIG.MeasuredTemplate.documentClass.mockClear();
                const localHtml = $(global.foundry.applications.api.DialogV2.__lastInstance.element);
                localHtml.find(".stp-move-template-btn").eq(0).trigger("click");
                await new Promise(r => setTimeout(r, 0));
                await new Promise(r => setTimeout(r, 0));
                expect(global.CONFIG.MeasuredTemplate.documentClass).toHaveBeenCalledWith(
                    expect.objectContaining({ t: "circle", distance: 7 / 5 }), expect.anything()
                );
            });

            it("pending-move row gets stp-pending-move class on reopen", async () => {
                global.canvas.mousePosition = { x: 300, y: 250 };
                const tpl = makeTemplate("t1", "user-001", "circle", 4);
                openConfigOnMoveTab([tpl]);
                const localHtml = $(global.foundry.applications.api.DialogV2.__lastInstance.element);
                localHtml.find(".stp-move-template-btn").eq(0).trigger("click");
                await new Promise(r => setTimeout(r, 0));
                await simulateCanvasClick();
                await new Promise(r => setTimeout(r, 0));
                // Open second dialog's move tab content
                const options2 = global.foundry.applications.api.DialogV2.__lastOptions;
                const inst2    = global.foundry.applications.api.DialogV2.__lastInstance;
                const container2 = document.createElement("div");
                container2.innerHTML = options2.content;
                inst2.element = container2;
                options2.render(new Event("render"), inst2);
                expect($(container2).find("tr.stp-pending-move")).toHaveLength(1);
            });
        });
    });

    describe("custom template buttons", () => {
        it("renders no custom buttons when no custom templates are saved", () => {
            setupBar();
            expect(document.querySelectorAll(".stp-custom-btn")).toHaveLength(0);
        });

        it("renders one custom button per saved custom template", () => {
            setupBar({
                customTemplates: [
                    { name: "Fireball", t: "circle", distance: 20, angle: 57, fillColor: "#ff4400" },
                    { name: "Fog",      t: "circle", distance: 20, angle: 57, fillColor: "#aaaaaa" },
                ]
            });
            expect(document.querySelectorAll(".stp-custom-btn")).toHaveLength(2);
        });

        it("custom button label matches the template name", () => {
            setupBar({
                customTemplates: [
                    { name: "Call Lightning", t: "circle", distance: 60, angle: 57, fillColor: "#ffff00" }
                ]
            });
            const btn = document.querySelector(".stp-custom-btn");
            expect(btn.textContent.trim()).toBe("Call Lightning");
        });

        it("clicking a custom button registers a canvas click listener", async () => {
            setupBar({
                customTemplates: [
                    { name: "Fireball", t: "circle", distance: 20, angle: 57, fillColor: "#ff4400" }
                ]
            });
            document.querySelector(".stp-custom-btn").click();
            await new Promise(r => setTimeout(r, 0));
            expect(window.addEventListener).toHaveBeenCalledWith(
                "pointerdown", expect.any(Function), { capture: true }
            );
        });

        it("creates the template with correct data when canvas is clicked after custom button", async () => {
            setupBar({
                customTemplates: [
                    { name: "Fireball", t: "circle", distance: 20, angle: 57, fillColor: "#ff4400" }
                ]
            });
            document.querySelector(".stp-custom-btn").click();
            await new Promise(r => setTimeout(r, 0));
            await simulateCanvasClick();
            expect(global.canvas.scene.createEmbeddedDocuments).toHaveBeenCalledWith(
                "MeasuredTemplate",
                [expect.objectContaining({ t: "circle", distance: 20, fillColor: "#ff4400" })]
            );
        });

        it("custom buttons appear inside the custom grid container", () => {
            setupBar({
                customTemplates: [
                    { name: "Fireball", t: "circle", distance: 20, angle: 57, fillColor: "#ff0000" }
                ]
            });
            const grid = document.querySelector(".stp-custom-grid");
            expect(grid).not.toBeNull();
            expect(grid.querySelector(".stp-custom-btn")).not.toBeNull();
        });

        it("config button is not inside the custom grid", () => {
            setupBar({
                customTemplates: [
                    { name: "Fireball", t: "circle", distance: 20, angle: 57, fillColor: "#ff0000" }
                ]
            });
            const grid = document.querySelector(".stp-custom-grid");
            const configBtn = document.querySelector(".stp-config-btn");
            expect(grid.contains(configBtn)).toBe(false);
        });

        it("multiple custom templates each appear in the grid", () => {
            setupBar({
                customTemplates: [
                    { name: "A", t: "circle", distance: 20, angle: 57, fillColor: "#ff0000" },
                    { name: "B", t: "circle", distance: 20, angle: 57, fillColor: "#00ff00" },
                ]
            });
            const grid = document.querySelector(".stp-custom-grid");
            expect(grid.querySelectorAll(".stp-custom-btn")).toHaveLength(2);
        });

        describe("XSS in custom template names", () => {
            it("does not execute a script tag injected as a template name", () => {
                window.__xssName = undefined;
                setupBar({
                    customTemplates: [
                        { name: "<script>window.__xssName=true</script>", t: "circle", distance: 20, angle: 57, fillColor: "#ff0000" }
                    ]
                });
                expect(window.__xssName).toBeUndefined();
            });

            it("does not execute an event handler injected as a template name", () => {
                window.__xssAttr = undefined;
                setupBar({
                    customTemplates: [
                        { name: '1" onmouseover="window.__xssAttr=true', t: "circle", distance: 20, angle: 57, fillColor: "#ff0000" }
                    ]
                });
                expect(window.__xssAttr).toBeUndefined();
            });

            it("does not execute an img onerror payload injected as a template name", () => {
                window.__xssImg = undefined;
                setupBar({
                    customTemplates: [
                        { name: '<img src=x onerror="window.__xssImg=true">', t: "circle", distance: 20, angle: 57, fillColor: "#ff0000" }
                    ]
                });
                expect(window.__xssImg).toBeUndefined();
            });
        });
    });

    describe("config dialog", () => {
        beforeEach(() => { setupBar(); });

        it("opens when config button is clicked", () => {
            global.foundry.applications.api.DialogV2.wait.mockClear();
            document.querySelector(".stp-config-btn").click();
            expect(global.foundry.applications.api.DialogV2.wait).toHaveBeenCalled();
        });

        it("does not open a second dialog when config button is clicked while already open", () => {
            document.querySelector(".stp-config-btn").click();
            global.foundry.applications.api.DialogV2.wait.mockClear();
            document.querySelector(".stp-config-btn").click();
            expect(global.foundry.applications.api.DialogV2.wait).not.toHaveBeenCalled();
        });

        it("does not open a second dialog when move button is clicked while config is open", () => {
            global.canvas.scene.templates.contents = [makeTemplate("t1", "user-001", "circle", 4)];
            document.querySelector(".stp-config-btn").click();
            global.foundry.applications.api.DialogV2.wait.mockClear();
            document.querySelector(".stp-move-btn").click();
            expect(global.foundry.applications.api.DialogV2.wait).not.toHaveBeenCalled();
        });

        it("allows reopening after the dialog is closed", async () => {
            document.querySelector(".stp-config-btn").click();
            global.foundry.applications.api.DialogV2.__resolveDialog(null);
            await new Promise(r => setTimeout(r, 0));
            global.foundry.applications.api.DialogV2.wait.mockClear();
            document.querySelector(".stp-config-btn").click();
            expect(global.foundry.applications.api.DialogV2.wait).toHaveBeenCalled();
        });

        it("dialog title includes module name and save hint", () => {
            document.querySelector(".stp-config-btn").click();
            const options = global.foundry.applications.api.DialogV2.__lastOptions;
            expect(options.window.title).toContain("Star Template Placer");
            expect(options.window.title).toContain("save to persist changes");
        });

        describe("tab navigation", () => {
            let html;
            beforeEach(() => {
                setupBar();
                document.querySelector(".stp-config-btn").click();
                ({ html } = openDialogHtml());
            });

            const ALL_PANELS = ["templates", "layout", "move", "extra", "reset"];

            function visiblePanels() {
                return ALL_PANELS.filter(
                    name => !html.find(`[data-panel="${name}"]`).hasClass("stp-tab-panel-hidden")
                );
            }

            it("templates tab is active on open", () => {
                expect(html.find(".stp-tab.stp-tab-active").data("tab")).toBe("templates");
            });

            it("only the templates panel is visible on open", () => {
                expect(visiblePanels()).toEqual(["templates"]);
            });

            it("clicking Extra tab shows the extra panel", () => {
                html.find("[data-tab='extra']").trigger("click");
                expect(visiblePanels()).toEqual(["extra"]);
            });

            it("clicking Reset tab shows the reset panel", () => {
                html.find("[data-tab='reset']").trigger("click");
                expect(visiblePanels()).toEqual(["reset"]);
            });

            it("clicking Layout tab shows the layout panel", () => {
                html.find("[data-tab='layout']").trigger("click");
                expect(visiblePanels()).toEqual(["layout"]);
            });

            it("clicking Move tab shows the move panel", () => {
                html.find("[data-tab='move']").trigger("click");
                expect(visiblePanels()).toEqual(["move"]);
            });

            it("clicking Templates tab after navigating away shows it again", () => {
                html.find("[data-tab='extra']").trigger("click");
                html.find("[data-tab='templates']").trigger("click");
                expect(visiblePanels()).toEqual(["templates"]);
            });

            it("exactly one panel is visible at all times", () => {
                for (const tab of ["reset", "extra", "layout", "move", "templates", "reset"]) {
                    html.find(`[data-tab='${tab}']`).trigger("click");
                    expect(visiblePanels()).toHaveLength(1);
                }
            });
        });

        describe("templates tab — empty state", () => {
            it("shows the no-custom-templates message when there are no custom templates", () => {
                setupBar();
                document.querySelector(".stp-config-btn").click();
                const { html } = openDialogHtml();
                expect(html.find(".stp-no-custom-row")).toHaveLength(1);
            });

            it("does not show the no-custom-templates message when custom templates exist", () => {
                setupBar({
                    customTemplates: [
                        { name: "Fireball", t: "circle", distance: 20, angle: 57, fillColor: "#ff0000" }
                    ]
                });
                document.querySelector(".stp-config-btn").click();
                const { html } = openDialogHtml();
                expect(html.find(".stp-no-custom-row")).toHaveLength(0);
            });
        });

        describe("templates tab — add template", () => {
            let html;
            beforeEach(() => {
                global.ui.notifications.warn.mockClear();
                setupBar();
                document.querySelector(".stp-config-btn").click();
                ({ html } = openDialogHtml());
            });

            it("warns when name is empty", () => {
                html.find(".stp-new-name").val("");
                html.find(".stp-add-btn").trigger("click");
                expect(global.ui.notifications.warn).toHaveBeenCalledWith(
                    expect.stringContaining("Template name is required")
                );
            });

            it("warns when a template with that name already exists", () => {
                html.find(".stp-new-name").val("Fireball");
                html.find(".stp-add-btn").trigger("click");
                html.find(".stp-new-name").val("Fireball");
                html.find(".stp-add-btn").trigger("click");
                expect(global.ui.notifications.warn).toHaveBeenCalledWith(
                    expect.stringContaining("already exists")
                );
            });

            it("adds a row to the table when a valid template is added", () => {
                html.find(".stp-new-name").val("Fireball");
                html.find(".stp-add-btn").trigger("click");
                expect(html.find("tbody tr[data-index]")).toHaveLength(1);
            });

            it("replaces the no-custom-templates message when the first template is added", () => {
                expect(html.find(".stp-no-custom-row")).toHaveLength(1);
                html.find(".stp-new-name").val("Fireball");
                html.find(".stp-add-btn").trigger("click");
                expect(html.find(".stp-no-custom-row")).toHaveLength(0);
            });

            it("clears the name input after adding", () => {
                html.find(".stp-new-name").val("Fireball");
                html.find(".stp-add-btn").trigger("click");
                expect(html.find(".stp-new-name").val()).toBe("");
            });

            it("shows cone angle row when type is cone", () => {
                html.find(".stp-new-type").val("cone").trigger("change");
                expect(html.find(".stp-new-cone-row").css("display")).not.toBe("none");
            });

            it("hides cone angle row when type is not cone", () => {
                html.find(".stp-new-type").val("cone").trigger("change");
                html.find(".stp-new-type").val("circle").trigger("change");
                expect(html.find(".stp-new-cone-row").css("display")).toBe("none");
            });

            it("width row is hidden by default", () => {
                expect(html.find(".stp-new-width-row").css("display")).toBe("none");
            });

            it("shows width row when type is ray", () => {
                html.find(".stp-new-type").val("ray").trigger("change");
                expect(html.find(".stp-new-width-row").css("display")).not.toBe("none");
            });

            it("shows width row when type is rect", () => {
                html.find(".stp-new-type").val("rect").trigger("change");
                expect(html.find(".stp-new-width-row").css("display")).not.toBe("none");
            });

            it("height row is hidden by default", () => {
                expect(html.find(".stp-new-height-row").css("display")).toBe("none");
            });

            it("shows height row when type is rect", () => {
                html.find(".stp-new-type").val("rect").trigger("change");
                expect(html.find(".stp-new-height-row").css("display")).not.toBe("none");
            });

            it("hides height row when type is changed away from rect", () => {
                html.find(".stp-new-type").val("rect").trigger("change");
                html.find(".stp-new-type").val("circle").trigger("change");
                expect(html.find(".stp-new-height-row").css("display")).toBe("none");
            });

            it("size row is hidden when type is rect", () => {
                html.find(".stp-new-type").val("rect").trigger("change");
                expect(html.find(".stp-new-distance-row").css("display")).toBe("none");
            });

            it("size row is visible when type is changed away from rect", () => {
                html.find(".stp-new-type").val("rect").trigger("change");
                html.find(".stp-new-type").val("circle").trigger("change");
                expect(html.find(".stp-new-distance-row").css("display")).not.toBe("none");
            });

            it("hides width row when type is changed away from ray", () => {
                html.find(".stp-new-type").val("ray").trigger("change");
                html.find(".stp-new-type").val("circle").trigger("change");
                expect(html.find(".stp-new-width-row").css("display")).toBe("none");
            });

            it("hides width row when type is changed away from rect", () => {
                html.find(".stp-new-type").val("rect").trigger("change");
                html.find(".stp-new-type").val("circle").trigger("change");
                expect(html.find(".stp-new-width-row").css("display")).toBe("none");
            });

            it("stores width in custom template for ray", () => {
                html.find(".stp-new-name").val("Wall");
                html.find(".stp-new-type").val("ray").trigger("change");
                html.find(".stp-new-width").val("15");
                html.find(".stp-add-btn").trigger("click");
                expect(html.find("tbody tr[data-index]")).toHaveLength(1);
            });

            it("stores width and height in custom template for rect and shows them in table", () => {
                html.find(".stp-new-name").val("Wall");
                html.find(".stp-new-type").val("rect").trigger("change");
                html.find(".stp-new-width").val("15");
                html.find(".stp-new-height").val("20");
                html.find(".stp-add-btn").trigger("click");
                const cells = html.find("tbody tr[data-index] td");
                expect(cells.eq(3).text()).toBe("15ft × 20ft");
            });

            it("shows width in feet for ray type", () => {
                html.find(".stp-new-name").val("Blast");
                html.find(".stp-new-type").val("ray").trigger("change");
                html.find(".stp-new-width").val("10");
                html.find(".stp-add-btn").trigger("click");
                const cells = html.find("tbody tr[data-index] td");
                expect(cells.eq(3).text()).toBe("10ft");
            });

            it("shows dash for width when type is not ray or rect", () => {
                html.find(".stp-new-name").val("Fireball");
                html.find(".stp-new-type").val("circle");
                html.find(".stp-add-btn").trigger("click");
                const cells = html.find("tbody tr[data-index] td");
                expect(cells.eq(3).text()).toBe("—");
            });

            it("shows width × height for rect type", () => {
                html.find(".stp-new-name").val("Wall");
                html.find(".stp-new-type").val("rect").trigger("change");
                html.find(".stp-new-width").val("10");
                html.find(".stp-new-height").val("30");
                html.find(".stp-add-btn").trigger("click");
                const cells = html.find("tbody tr[data-index] td");
                expect(cells.eq(3).text()).toBe("10ft × 30ft");
            });

            it("shows angle in degrees for cone type", () => {
                html.find(".stp-new-name").val("Breathe");
                html.find(".stp-new-type").val("cone").trigger("change");
                html.find(".stp-new-angle").val("90");
                html.find(".stp-add-btn").trigger("click");
                const cells = html.find("tbody tr[data-index] td");
                expect(cells.eq(4).text()).toBe("90°");
            });

            it("shows dash for angle when type is not cone", () => {
                html.find(".stp-new-name").val("Fireball");
                html.find(".stp-new-type").val("circle");
                html.find(".stp-add-btn").trigger("click");
                const cells = html.find("tbody tr[data-index] td");
                expect(cells.eq(4).text()).toBe("—");
            });

            it("Enter in name field triggers add", () => {
                html.find(".stp-new-name").val("Quick");
                html.find(".stp-new-name").trigger({ type: "keydown", key: "Enter" });
                expect(html.find("tbody tr[data-index]")).toHaveLength(1);
            });

            it("does not warn when name is valid and unique", () => {
                html.find(".stp-new-name").val("Thunderwave");
                html.find(".stp-add-btn").trigger("click");
                expect(global.ui.notifications.warn).not.toHaveBeenCalled();
            });

            describe("XSS in add form", () => {
                it("does not execute a script tag injected as a name", () => {
                    window.__xssAddScript = undefined;
                    html.find(".stp-new-name").val("<script>window.__xssAddScript=true</script>");
                    html.find(".stp-add-btn").trigger("click");
                    expect(window.__xssAddScript).toBeUndefined();
                });

                it("does not execute an event handler injected as a name", () => {
                    window.__xssAddAttr = undefined;
                    html.find(".stp-new-name").val('x" onmouseover="window.__xssAddAttr=true');
                    html.find(".stp-add-btn").trigger("click");
                    expect(window.__xssAddAttr).toBeUndefined();
                });
            });
        });

        describe("templates tab — delete template", () => {
            it("removes the row from the table when delete is clicked", () => {
                setupBar({
                    customTemplates: [
                        { name: "Fireball", t: "circle", distance: 20, angle: 57, fillColor: "#ff0000" }
                    ]
                });
                document.querySelector(".stp-config-btn").click();
                const { html } = openDialogHtml();
                expect(html.find("tbody tr[data-index]")).toHaveLength(1);
                html.find(".stp-delete-btn").trigger("click");
                expect(html.find("tbody tr[data-index]")).toHaveLength(0);
            });

            it("shows the no-custom-templates message when the last template is deleted", () => {
                setupBar({
                    customTemplates: [
                        { name: "Fireball", t: "circle", distance: 20, angle: 57, fillColor: "#ff0000" }
                    ]
                });
                document.querySelector(".stp-config-btn").click();
                const { html } = openDialogHtml();
                html.find(".stp-delete-btn").trigger("click");
                expect(html.find(".stp-no-custom-row")).toHaveLength(1);
            });

            it("re-indexes remaining rows correctly after delete", () => {
                setupBar({
                    customTemplates: [
                        { name: "A", t: "circle", distance: 20, angle: 57, fillColor: "#ff0000" },
                        { name: "B", t: "circle", distance: 30, angle: 57, fillColor: "#00ff00" },
                        { name: "C", t: "circle", distance: 40, angle: 57, fillColor: "#0000ff" },
                    ]
                });
                document.querySelector(".stp-config-btn").click();
                const { html } = openDialogHtml();
                html.find("tbody tr").eq(0).find(".stp-delete-btn").trigger("click");
                const rows = html.find("tbody tr");
                expect(rows).toHaveLength(2);
                expect(rows.eq(0).data("index")).toBe(0);
                expect(rows.eq(1).data("index")).toBe(1);
            });

            it("saves pending custom templates on Save", async () => {
                setupBar({
                    customTemplates: [
                        { name: "Fireball", t: "circle", distance: 20, angle: 57, fillColor: "#ff0000" }
                    ]
                });
                document.querySelector(".stp-config-btn").click();
                const { html, options } = openDialogHtml();
                html.find(".stp-delete-btn").trigger("click");
                global.game.user.setFlag.mockClear();
                const container = global.foundry.applications.api.DialogV2.__lastInstance.element;
                const saveBtn = options.buttons.find(b => b.action === "save");
                await saveBtn.callback(null, null, { element: container });
                expect(global.game.user.setFlag).toHaveBeenCalledWith(
                    "star-template-placer", "customTemplates", []
                );
            });
        });

        describe("layout tab", () => {
            function openLayout(flagOverrides = {}) {
                setupBar(flagOverrides);
                document.querySelector(".stp-config-btn").click();
                const { html } = openDialogHtml();
                html.find("[data-tab='layout']").trigger("click");
                return html;
            }

            it("shows empty state when there are no custom templates", () => {
                const html = openLayout();
                expect(html.find(".stp-layout-empty")).toHaveLength(1);
            });

            it("shows tiles for each custom template", () => {
                const html = openLayout({
                    customTemplates: [
                        { name: "Fireball", t: "circle", distance: 20, angle: 57, fillColor: "#ff0000" },
                        { name: "Fog",      t: "circle", distance: 30, angle: 57, fillColor: "#aaaaaa" },
                    ]
                });
                expect(html.find(".stp-layout-tile")).toHaveLength(2);
                expect(html.find(".stp-layout-tile").eq(0).text()).toBe("Fireball");
                expect(html.find(".stp-layout-tile").eq(1).text()).toBe("Fog");
            });

            it("shows a row count input defaulting to 1", () => {
                const html = openLayout({
                    customTemplates: [
                        { name: "A", t: "circle", distance: 20, angle: 57, fillColor: "#ff0000" },
                    ]
                });
                expect(html.find(".stp-rows-input").val()).toBe("1");
            });

            it("changing row count reshapes the layout", () => {
                const html = openLayout({
                    customTemplates: [
                        { name: "A", t: "circle", distance: 20, angle: 57, fillColor: "#ff0000" },
                        { name: "B", t: "circle", distance: 20, angle: 57, fillColor: "#00ff00" },
                        { name: "C", t: "circle", distance: 20, angle: 57, fillColor: "#0000ff" },
                        { name: "D", t: "circle", distance: 20, angle: 57, fillColor: "#ffff00" },
                    ]
                });
                html.find(".stp-rows-input").val("2").trigger("change");
                expect(html.find(".stp-layout-row")).toHaveLength(2);
            });

            it("saves barGrid on Save", async () => {
                setupBar({
                    customTemplates: [
                        { name: "Fireball", t: "circle", distance: 20, angle: 57, fillColor: "#ff0000" },
                    ]
                });
                document.querySelector(".stp-config-btn").click();
                const { options } = openDialogHtml();
                global.game.user.setFlag.mockClear();
                const container = global.foundry.applications.api.DialogV2.__lastInstance.element;
                const saveBtn = options.buttons.find(b => b.action === "save");
                await saveBtn.callback(null, null, { element: container });
                expect(global.game.user.setFlag).toHaveBeenCalledWith(
                    "star-template-placer", "barGrid", expect.any(Array)
                );
            });

            it("adding a template also adds it to the layout", () => {
                const html = openLayout();
                html.find("[data-tab='templates']").trigger("click");
                html.find(".stp-new-name").val("Nova");
                html.find(".stp-add-btn").trigger("click");
                html.find("[data-tab='layout']").trigger("click");
                expect(html.find(".stp-layout-tile").text()).toContain("Nova");
            });

            it("deleting a template removes it from the layout", () => {
                const html = openLayout({
                    customTemplates: [
                        { name: "Fireball", t: "circle", distance: 20, angle: 57, fillColor: "#ff0000" },
                    ]
                });
                expect(html.find(".stp-layout-tile")).toHaveLength(1);
                html.find("[data-tab='templates']").trigger("click");
                html.find(".stp-delete-btn").trigger("click");
                html.find("[data-tab='layout']").trigger("click");
                expect(html.find(".stp-layout-empty")).toHaveLength(1);
            });
        });

        describe("extra tab", () => {
            function openExtra(flagOverrides = {}) {
                setupBar(flagOverrides);
                document.querySelector(".stp-config-btn").click();
                const { html } = openDialogHtml();
                html.find("[data-tab='extra']").trigger("click");
                return html;
            }

            it("checkbox is unchecked when barHidden is not set", () => {
                const html = openExtra();
                expect(html.find(".stp-hide-bar-checkbox").prop("checked")).toBe(false);
            });

            it("checkbox is checked when barHidden is true", () => {
                const html = openExtra({ barHidden: true });
                expect(html.find(".stp-hide-bar-checkbox").prop("checked")).toBe(true);
            });

            it("checking the checkbox hides the bar immediately for preview", () => {
                const html = openExtra();
                html.find(".stp-hide-bar-checkbox").prop("checked", true).trigger("change");
                expect(document.querySelector(".stp-template-bar").style.display).toBe("none");
            });

            it("unchecking the checkbox shows the bar immediately", () => {
                const html = openExtra({ barHidden: true });
                html.find(".stp-hide-bar-checkbox").prop("checked", false).trigger("change");
                expect(document.querySelector(".stp-template-bar").style.display).not.toBe("none");
            });

            it("Cancel restores the bar when checkbox was previewed as checked", async () => {
                const html = openExtra();
                html.find(".stp-hide-bar-checkbox").prop("checked", true).trigger("change");
                global.foundry.applications.api.DialogV2.__resolveDialog(null);
                await new Promise(r => setTimeout(r, 0));
                expect(document.querySelector(".stp-template-bar").style.display).not.toBe("none");
            });

            it("Save saves barHidden as true when checkbox is checked", async () => {
                const html = openExtra();
                html.find(".stp-hide-bar-checkbox").prop("checked", true);
                global.game.settings.set.mockClear();
                const options = global.foundry.applications.api.DialogV2.__lastOptions;
                const container = global.foundry.applications.api.DialogV2.__lastInstance.element;
                const saveBtn = options.buttons.find(b => b.action === "save");
                await saveBtn.callback(null, null, { element: container });
                expect(global.game.settings.set).toHaveBeenCalledWith(
                    "star-template-placer", "barHidden", true
                );
            });

            it("Save saves barHidden as false when checkbox is unchecked", async () => {
                const html = openExtra({ barHidden: true });
                html.find(".stp-hide-bar-checkbox").prop("checked", false);
                global.game.settings.set.mockClear();
                const options = global.foundry.applications.api.DialogV2.__lastOptions;
                const container = global.foundry.applications.api.DialogV2.__lastInstance.element;
                const saveBtn = options.buttons.find(b => b.action === "save");
                await saveBtn.callback(null, null, { element: container });
                expect(global.game.settings.set).toHaveBeenCalledWith(
                    "star-template-placer", "barHidden", false
                );
            });
        });

        describe("reset tab", () => {
            let html;
            beforeEach(() => {
                global.game.user.setFlag.mockClear();
                global.game.user.unsetFlag.mockClear();
                setupBar();
                document.querySelector(".stp-config-btn").click();
                ({ html } = openDialogHtml());
                html.find("[data-tab='reset']").trigger("click");
            });

            it("reset position button does not immediately save the barPosition flag", () => {
                html.find(".stp-reset-position-btn").trigger("click");
                expect(global.game.user.setFlag).not.toHaveBeenCalledWith(
                    "star-template-placer", "barPosition", expect.anything()
                );
            });

            it("reset position applies default position immediately for preview", () => {
                setupBar({ barPosition: { left: 200, top: 150 } });
                document.querySelector(".stp-config-btn").click();
                const { html: localHtml } = openDialogHtml();
                localHtml.find("[data-tab='reset']").trigger("click");
                localHtml.find(".stp-reset-position-btn").trigger("click");
                const bar = document.querySelector(".stp-template-bar");
                expect(bar.style.left).not.toBe("200px");
                expect(bar.style.top).not.toBe("150px");
            });

            it("reset position unsets the barPosition flag when Save is clicked", async () => {
                html.find(".stp-reset-position-btn").trigger("click");
                global.game.user.unsetFlag.mockClear();
                const options = global.foundry.applications.api.DialogV2.__lastOptions;
                const container = global.foundry.applications.api.DialogV2.__lastInstance.element;
                const saveBtn = options.buttons.find(b => b.action === "save");
                await saveBtn.callback(null, null, { element: container });
                expect(global.game.user.unsetFlag).toHaveBeenCalledWith(
                    "star-template-placer", "barPosition"
                );
            });

            it("reset position does not unset flag when Save is clicked without reset", async () => {
                global.game.user.unsetFlag.mockClear();
                const options = global.foundry.applications.api.DialogV2.__lastOptions;
                const container = global.foundry.applications.api.DialogV2.__lastInstance.element;
                const saveBtn = options.buttons.find(b => b.action === "save");
                await saveBtn.callback(null, null, { element: container });
                expect(global.game.user.unsetFlag).not.toHaveBeenCalledWith(
                    "star-template-placer", "barPosition"
                );
            });

            it("Cancel restores original bar position when reset was previewed", async () => {
                setupBar({ barPosition: { left: 200, top: 150 } });
                document.querySelector(".stp-config-btn").click();
                openDialogHtml();
                const localHtml = $(global.foundry.applications.api.DialogV2.__lastInstance.element);
                localHtml.find("[data-tab='reset']").trigger("click");
                localHtml.find(".stp-reset-position-btn").trigger("click");
                global.foundry.applications.api.DialogV2.__resolveDialog(null);
                await new Promise(r => setTimeout(r, 0));
                expect(document.querySelector(".stp-template-bar").style.left).toBe("200px");
                expect(document.querySelector(".stp-template-bar").style.top).toBe("150px");
            });
        });
    });

    describe("resilience", () => {
        beforeEach(() => { setupBar(); });

        it("does not throw when the DOM is empty before ready", () => {
            document.body.innerHTML = "";
            expect(() => hookCallbacks["ready"]()).not.toThrow();
        });

        it("each custom button click followed by a canvas click creates an independent template", async () => {
            setupBar({
                customTemplates: [
                    { name: "Fireball", t: "circle", distance: 20, angle: 57, fillColor: "#ff0000" }
                ]
            });
            const btn = document.querySelector(".stp-custom-btn");

            btn.click();
            await new Promise(r => setTimeout(r, 0));
            await simulateCanvasClick();

            btn.click();
            await new Promise(r => setTimeout(r, 0));
            await simulateCanvasClick();

            expect(global.canvas.scene.createEmbeddedDocuments).toHaveBeenCalledTimes(2);
        });
    });
});
