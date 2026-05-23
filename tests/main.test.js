const $ = require("jquery");

const hookCallbacks = {};

global.$ = $;
global.Hooks = {
    once: jest.fn((event, cb) => { hookCallbacks[event] = cb; }),
};
global.game = {
    user: {
        id: "user-001",
        color: { css: "#4488ff" },
        getFlag:   jest.fn().mockReturnValue(undefined),
        setFlag:   jest.fn().mockResolvedValue(undefined),
        unsetFlag: jest.fn().mockResolvedValue(undefined),
    },
    settings: {
        register: jest.fn(),
        get:      jest.fn().mockReturnValue(false),
        set:      jest.fn().mockResolvedValue(undefined),
    },
};
global.canvas = {
    stage: { pivot: { x: 500, y: 400 } },
    scene: {
        templates: { contents: [] },
        createEmbeddedDocuments: jest.fn().mockResolvedValue([]),
    },
};
global.ui = {
    notifications: { warn: jest.fn() },
};
global.foundry = { applications: { api: { DialogV2: {} } } };
global.foundry.applications.api.DialogV2.wait = jest.fn().mockImplementation((options) => {
    global.foundry.applications.api.DialogV2.__lastOptions = options;
    const instance = { render: jest.fn(), close: jest.fn(), element: document.createElement("div") };
    global.foundry.applications.api.DialogV2.__lastInstance = instance;
    let resolveDialog;
    global.foundry.applications.api.DialogV2.__resolveDialog = (val) => resolveDialog(val);
    return new Promise(r => { resolveDialog = r; });
});

require("../scripts/main.js");

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

function setupBar(flagOverrides = {}) {
    const { barHidden, ...flagsOnly } = flagOverrides;
    global.game.user.getFlag.mockImplementation((ns, key) => flagsOnly[key] ?? undefined);
    global.game.settings.get.mockImplementation((ns, key) => key === "barHidden" ? (barHidden ?? false) : false);
    global.canvas.scene.templates.contents = [];
    global.canvas.scene.createEmbeddedDocuments.mockClear();
    document.body.innerHTML = "";
    hookCallbacks["ready"]();
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

        it("renders a Remove button", () => {
            expect(document.querySelector(".stp-remove-btn")).not.toBeNull();
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

        it("dialog has a shape select with all four types", () => {
            document.querySelector(".stp-place-btn").click();
            const { html } = openDialogHtml();
            const options = [...html.find(".stp-type-select option")].map(o => o.value);
            expect(options).toContain("circle");
            expect(options).toContain("cone");
            expect(options).toContain("rect");
            expect(options).toContain("ray");
        });

        it("dialog has a distance input defaulting to 20", () => {
            document.querySelector(".stp-place-btn").click();
            const { html } = openDialogHtml();
            expect(html.find(".stp-distance-input").val()).toBe("20");
        });

        it("dialog has a color input", () => {
            document.querySelector(".stp-place-btn").click();
            const { html } = openDialogHtml();
            expect(html.find(".stp-color-input").length).toBe(1);
        });

        it("cone angle row is hidden by default", () => {
            document.querySelector(".stp-place-btn").click();
            const { html } = openDialogHtml();
            expect(html.find(".stp-cone-row").css("display")).toBe("none");
        });

        it("cone angle row shows when shape is changed to cone", () => {
            document.querySelector(".stp-place-btn").click();
            const { html } = openDialogHtml();
            html.find(".stp-type-select").val("cone").trigger("change");
            expect(html.find(".stp-cone-row").css("display")).not.toBe("none");
        });

        it("cone angle row hides again when shape is changed away from cone", () => {
            document.querySelector(".stp-place-btn").click();
            const { html } = openDialogHtml();
            html.find(".stp-type-select").val("cone").trigger("change");
            html.find(".stp-type-select").val("circle").trigger("change");
            expect(html.find(".stp-cone-row").css("display")).toBe("none");
        });

        it("Place button callback calls createEmbeddedDocuments", async () => {
            document.querySelector(".stp-place-btn").click();
            const { options } = openDialogHtml();
            const container = global.foundry.applications.api.DialogV2.__lastInstance.element;
            const placeBtn = options.buttons.find(b => b.action === "place");
            await placeBtn.callback(null, null, { element: container });
            expect(global.canvas.scene.createEmbeddedDocuments).toHaveBeenCalledWith(
                "MeasuredTemplate",
                [expect.objectContaining({ t: "circle", distance: expect.any(Number) })]
            );
        });

        it("places template at canvas pivot position", async () => {
            global.canvas.stage.pivot = { x: 700, y: 300 };
            document.querySelector(".stp-place-btn").click();
            const { options } = openDialogHtml();
            const container = global.foundry.applications.api.DialogV2.__lastInstance.element;
            const placeBtn = options.buttons.find(b => b.action === "place");
            await placeBtn.callback(null, null, { element: container });
            expect(global.canvas.scene.createEmbeddedDocuments).toHaveBeenCalledWith(
                "MeasuredTemplate",
                [expect.objectContaining({ x: 700, y: 300 })]
            );
            global.canvas.stage.pivot = { x: 500, y: 400 };
        });

        it("clamps distance to minimum 5", async () => {
            document.querySelector(".stp-place-btn").click();
            const { html, options } = openDialogHtml();
            html.find(".stp-distance-input").val("-10");
            const container = global.foundry.applications.api.DialogV2.__lastInstance.element;
            const placeBtn = options.buttons.find(b => b.action === "place");
            await placeBtn.callback(null, null, { element: container });
            expect(global.canvas.scene.createEmbeddedDocuments).toHaveBeenCalledWith(
                "MeasuredTemplate",
                [expect.objectContaining({ distance: 5 })]
            );
        });

        it("warns and does not create template when canvas.scene is null", async () => {
            const originalScene = global.canvas.scene;
            global.canvas.scene = null;
            global.ui.notifications.warn.mockClear();
            document.querySelector(".stp-place-btn").click();
            const { options } = openDialogHtml();
            const container = global.foundry.applications.api.DialogV2.__lastInstance.element;
            const placeBtn = options.buttons.find(b => b.action === "place");
            await placeBtn.callback(null, null, { element: container });
            expect(global.ui.notifications.warn).toHaveBeenCalledWith(
                expect.stringContaining("No active scene")
            );
            global.canvas.scene = originalScene;
        });

        it("dialog title is 'Place Template'", () => {
            document.querySelector(".stp-place-btn").click();
            const options = global.foundry.applications.api.DialogV2.__lastOptions;
            expect(options.window.title).toBe("Place Template");
        });
    });

    describe("Remove button", () => {
        beforeEach(() => { setupBar(); });

        it("warns when there are no templates to remove", async () => {
            global.ui.notifications.warn.mockClear();
            global.canvas.scene.templates.contents = [];
            document.querySelector(".stp-remove-btn").click();
            await new Promise(r => setTimeout(r, 0));
            expect(global.ui.notifications.warn).toHaveBeenCalledWith(
                expect.stringContaining("No templates to remove")
            );
        });

        it("calls delete on the last template", async () => {
            const mockDelete = jest.fn().mockResolvedValue(undefined);
            global.canvas.scene.templates.contents = [
                { user: "other-user", delete: jest.fn() },
                { user: "user-001",   delete: mockDelete },
            ];
            document.querySelector(".stp-remove-btn").click();
            await new Promise(r => setTimeout(r, 0));
            expect(mockDelete).toHaveBeenCalled();
        });

        it("prefers the current user's last template over another user's", async () => {
            const myDelete    = jest.fn().mockResolvedValue(undefined);
            const otherDelete = jest.fn().mockResolvedValue(undefined);
            global.canvas.scene.templates.contents = [
                { user: "other-user", delete: otherDelete },
                { user: "user-001",   delete: myDelete },
                { user: "other-user", delete: jest.fn() },
            ];
            document.querySelector(".stp-remove-btn").click();
            await new Promise(r => setTimeout(r, 0));
            expect(myDelete).toHaveBeenCalled();
            expect(otherDelete).not.toHaveBeenCalled();
        });

        it("falls back to the last template when no templates belong to current user", async () => {
            const fallbackDelete = jest.fn().mockResolvedValue(undefined);
            global.canvas.scene.templates.contents = [
                { user: "other-user", delete: jest.fn() },
                { user: "other-user", delete: fallbackDelete },
            ];
            document.querySelector(".stp-remove-btn").click();
            await new Promise(r => setTimeout(r, 0));
            expect(fallbackDelete).toHaveBeenCalled();
        });

        it("warns when canvas.scene is null", async () => {
            const originalScene = global.canvas.scene;
            global.canvas.scene = null;
            global.ui.notifications.warn.mockClear();
            document.querySelector(".stp-remove-btn").click();
            await new Promise(r => setTimeout(r, 0));
            expect(global.ui.notifications.warn).toHaveBeenCalledWith(
                expect.stringContaining("No active scene")
            );
            global.canvas.scene = originalScene;
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

        it("clicking a custom button calls createEmbeddedDocuments", async () => {
            setupBar({
                customTemplates: [
                    { name: "Fireball", t: "circle", distance: 20, angle: 57, fillColor: "#ff4400" }
                ]
            });
            document.querySelector(".stp-custom-btn").click();
            await new Promise(r => setTimeout(r, 0));
            expect(global.canvas.scene.createEmbeddedDocuments).toHaveBeenCalledWith(
                "MeasuredTemplate",
                [expect.objectContaining({ t: "circle", distance: 20, fillColor: "#ff4400" })]
            );
        });

        it("custom buttons appear before the config button", () => {
            setupBar({
                customTemplates: [
                    { name: "Fireball", t: "circle", distance: 20, angle: 57, fillColor: "#ff0000" }
                ]
            });
            const bar = document.querySelector(".stp-template-bar");
            const children = [...bar.children];
            const customIdx = children.findIndex(el => el.classList.contains("stp-custom-btn"));
            const configIdx = children.findIndex(el => el.classList.contains("stp-config-btn"));
            expect(customIdx).toBeLessThan(configIdx);
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

        it("dialog title includes module name", () => {
            document.querySelector(".stp-config-btn").click();
            const options = global.foundry.applications.api.DialogV2.__lastOptions;
            expect(options.window.title).toContain("Star Template Placer");
        });

        describe("tab navigation", () => {
            let html;
            beforeEach(() => {
                setupBar();
                document.querySelector(".stp-config-btn").click();
                ({ html } = openDialogHtml());
            });

            function visiblePanel() {
                return ["templates", "extra", "reset"].find(
                    name => !html.find(`[data-panel="${name}"]`).hasClass("stp-tab-panel-hidden")
                );
            }

            it("templates tab is active on open", () => {
                expect(html.find(".stp-tab.stp-tab-active").data("tab")).toBe("templates");
            });

            it("only the templates panel is visible on open", () => {
                expect(visiblePanel()).toBe("templates");
            });

            it("clicking Extra tab shows the extra panel", () => {
                html.find("[data-tab='extra']").trigger("click");
                expect(visiblePanel()).toBe("extra");
            });

            it("clicking Reset tab shows the reset panel", () => {
                html.find("[data-tab='reset']").trigger("click");
                expect(visiblePanel()).toBe("reset");
            });

            it("clicking Templates tab after navigating away shows it again", () => {
                html.find("[data-tab='extra']").trigger("click");
                html.find("[data-tab='templates']").trigger("click");
                expect(visiblePanel()).toBe("templates");
            });

            it("exactly one panel is visible at all times", () => {
                for (const tab of ["extra", "reset", "templates", "extra"]) {
                    html.find(`[data-tab='${tab}']`).trigger("click");
                    const visibleCount = ["templates", "extra", "reset"].filter(
                        name => !html.find(`[data-panel="${name}"]`).hasClass("stp-tab-panel-hidden")
                    ).length;
                    expect(visibleCount).toBe(1);
                }
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
                expect(html.find("tbody tr")).toHaveLength(1);
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
                html.find(".stp-new-type").val("rect").trigger("change");
                expect(html.find(".stp-new-cone-row").css("display")).toBe("none");
            });

            it("Enter in name field triggers add", () => {
                html.find(".stp-new-name").val("Quick");
                html.find(".stp-new-name").trigger({ type: "keydown", key: "Enter" });
                expect(html.find("tbody tr")).toHaveLength(1);
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
                expect(html.find("tbody tr")).toHaveLength(1);
                html.find(".stp-delete-btn").trigger("click");
                expect(html.find("tbody tr")).toHaveLength(0);
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

        it("each custom button click creates an independent template call", async () => {
            setupBar({
                customTemplates: [
                    { name: "Fireball", t: "circle", distance: 20, angle: 57, fillColor: "#ff0000" }
                ]
            });
            global.canvas.scene.createEmbeddedDocuments.mockClear();
            const btn = document.querySelector(".stp-custom-btn");
            btn.click();
            btn.click();
            await new Promise(r => setTimeout(r, 0));
            expect(global.canvas.scene.createEmbeddedDocuments).toHaveBeenCalledTimes(2);
        });
    });
});
