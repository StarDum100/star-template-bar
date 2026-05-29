const fs   = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "module.json"), "utf-8"));

// Flatten a nested translation object into dot-separated keys so two language files can be
// compared for parity (same set of keys, same {placeholders}).
function flatten(obj, prefix = "") {
  const out = {};
  for (const [key, value] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      Object.assign(out, flatten(value, full));
    } else {
      out[full] = value;
    }
  }
  return out;
}

function placeholders(str) {
  return [...String(str).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
}

const languages = manifest.languages ?? [];
const flatByLang = Object.fromEntries(
  languages.map((l) => {
    const parsed = JSON.parse(fs.readFileSync(path.join(ROOT, l.path), "utf-8"));
    return [l.lang, flatten(parsed)];
  })
);

describe("localization files", () => {
  it("the English file is the source of truth and is non-empty", () => {
    expect(flatByLang.en).toBeDefined();
    expect(Object.keys(flatByLang.en).length).toBeGreaterThan(0);
  });

  it("every English value is a non-empty string", () => {
    for (const [key, value] of Object.entries(flatByLang.en)) {
      expect(typeof value).toBe("string");
      expect(value.length).toBeGreaterThan(0);
    }
  });

  // Each non-English language must define exactly the same keys with the same placeholders,
  // otherwise the UI would fall back to raw keys or drop interpolated data in that locale.
  // Skipped while English is the only shipped language; activates automatically when more
  // languages are added to module.json.
  const otherLanguages = languages.filter((l) => l.lang !== "en");
  (otherLanguages.length ? describe.each(otherLanguages) : describe.skip.each([{ lang: "none" }]))(
    "$lang parity with English",
    (language) => {
      const en = flatByLang.en;

      it("defines every English key (no missing translations)", () => {
        expect(Object.keys(flatByLang[language.lang]).sort()).toEqual(Object.keys(en).sort());
      });

      it("uses the same placeholders as English for every key", () => {
        const flat = flatByLang[language.lang];
        for (const key of Object.keys(en)) {
          expect(placeholders(flat[key])).toEqual(placeholders(en[key]));
        }
      });
    }
  );
});

describe("localized strings used by main.js", () => {
  const en = flatByLang.en;

  it.each([
    "STARTEMPLATEBAR.Bar.PlaceButton",
    "STARTEMPLATEBAR.Bar.MoveButton",
    "STARTEMPLATEBAR.Shape.circle",
    "STARTEMPLATEBAR.Place.DialogTitle",
    "STARTEMPLATEBAR.Tab.Templates",
    "STARTEMPLATEBAR.Move.UnknownOwner",
    "STARTEMPLATEBAR.Layout.Empty",
    "STARTEMPLATEBAR.Dialog.Title",
    "STARTEMPLATEBAR.Notify.NoActiveScene",
    "STARTEMPLATEBAR.Settings.HideBar.Name",
  ])("defines %s", (key) => {
    expect(en[key]).toBeTruthy();
  });

  it("Dialog.Title carries a {title} placeholder for interpolation", () => {
    expect(en["STARTEMPLATEBAR.Dialog.Title"]).toContain("{title}");
  });

  it("Notify.NameExists carries a {name} placeholder for interpolation", () => {
    expect(en["STARTEMPLATEBAR.Notify.NameExists"]).toContain("{name}");
  });

  it("defines a label for every template shape type", () => {
    for (const type of ["circle", "cone", "ray", "rect"]) {
      expect(en[`STARTEMPLATEBAR.Shape.${type}`]).toBeTruthy();
    }
  });
});
