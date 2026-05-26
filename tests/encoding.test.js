const fs   = require("fs");
const path = require("path");

const FILES = [
    path.join(__dirname, "../scripts/main.js"),
    path.join(__dirname, "../styles/styles.css"),
    path.join(__dirname, "main.test.js"),
    path.join(__dirname, "encoding.test.js"),
];

// String.fromCodePoint keeps this file pure ASCII while producing the runtime
// sequences that mark Windows-1252 double-encoding corruption.
const MOJIBAKE = [
    [String.fromCodePoint(0x00C2, 0x00B0),  "double-encoded degree sign"],
    [String.fromCodePoint(0x00C3, 0x2014), "double-encoded multiplication sign"],
    [String.fromCodePoint(0x00E2, 0x20AC), "double-encoded em-dash or curly quote"],
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
