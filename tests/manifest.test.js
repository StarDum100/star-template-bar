const fs   = require("fs");
const path = require("path");

const ROOT     = path.join(__dirname, "..");
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

    it("all declared language files exist on disk", () => {
        for (const language of manifest.languages ?? []) {
            expect(fs.existsSync(path.join(ROOT, language.path))).toBe(true);
        }
    });

    describe("languages", () => {
        it("declares at least one language", () => {
            expect(manifest.languages?.length).toBeGreaterThan(0);
        });

        it("ships an English localization", () => {
            expect(manifest.languages.some((l) => l.lang === "en")).toBe(true);
        });

        it("every language entry has lang, name, and path", () => {
            for (const language of manifest.languages ?? []) {
                expect(language.lang).toBeTruthy();
                expect(language.name).toBeTruthy();
                expect(language.path).toBeTruthy();
            }
        });

        it("every declared language file is valid JSON nested under STARTEMPLATEBAR", () => {
            for (const language of manifest.languages ?? []) {
                const raw = fs.readFileSync(path.join(ROOT, language.path), "utf-8");
                const parsed = JSON.parse(raw);
                expect(parsed.STARTEMPLATEBAR).toBeDefined();
            }
        });
    });
});
