const manifest = require("../module.json");

describe("module.json", () => {
    it("has the correct id", () => {
        expect(manifest.id).toBe("star-template-bar");
    });

    it("has a title", () => {
        expect(typeof manifest.title).toBe("string");
        expect(manifest.title.length).toBeGreaterThan(0);
    });

    it("has a description", () => {
        expect(typeof manifest.description).toBe("string");
        expect(manifest.description.length).toBeGreaterThan(0);
    });

    it("has a semver-compatible version", () => {
        expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/);
    });

    it("has at least one author", () => {
        expect(Array.isArray(manifest.authors)).toBe(true);
        expect(manifest.authors.length).toBeGreaterThan(0);
        expect(typeof manifest.authors[0].name).toBe("string");
    });

    it("lists the main script", () => {
        expect(manifest.esmodules).toContain("scripts/main.js");
    });

    it("lists the stylesheet", () => {
        expect(manifest.styles).toContain("styles/styles.css");
    });

    it("has compatibility.minimum set", () => {
        expect(manifest.compatibility?.minimum).toBeDefined();
    });

    it("has compatibility.verified set", () => {
        expect(manifest.compatibility?.verified).toBeDefined();
    });

    it("minimum is not greater than verified", () => {
        const min = parseInt(manifest.compatibility.minimum);
        const ver = parseInt(manifest.compatibility.verified);
        expect(min).toBeLessThanOrEqual(ver);
    });
});
