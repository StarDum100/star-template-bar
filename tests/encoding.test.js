const fs   = require("fs");
const path = require("path");

const FILES = [
    path.join(__dirname, "../scripts/main.js"),
    path.join(__dirname, "main.test.js"),
];

// Each string is a JS unicode escape sequence so this file stays pure ASCII.
// At runtime JS decodes them into the two-byte signature of Windows-1252 double-encoding.
const MOJIBAKE = [
    ["\u00C2\u00B0", "double-encoded degree sign"],
    ["\u00C3\u2014", "double-encoded multiplication sign"],
    ["\u00E2\u20AC", "double-encoded em-dash or curly quote"],
];

describe("encoding", () => {
    for (const file of FILES) {
        const rel = path.relative(path.join(__dirname, ".."), file);
        const src = fs.readFileSync(file, "utf8");
        for (const [seq, label] of MOJIBAKE) {
            it(rel + " has no " + label, () => {
                expect(src.includes(seq)).toBe(false);
            });
        }
    }
});
