import test from "node:test";
import assert from "node:assert/strict";
import {
  RESIDUES, WATER, PROTON, compositionMass, mzFromMass, parsePeaks,
  generateCandidates, annotatePeaks, resultsCsv
} from "./annotator.mjs";

test("released composition neutral mass and singly protonated m/z", () => {
  const mass = compositionMass({Hex: 3, HexNAc: 2, Fuc: 1});
  const expected = WATER + 3 * RESIDUES.Hex + 2 * RESIDUES.HexNAc + RESIDUES.Fuc;
  assert.ok(Math.abs(mass - expected) < 1e-9);
  assert.ok(Math.abs(compositionMass({Hex:3, HexNAc:2}) - 910.3277800445) < 1e-8);
  assert.ok(Math.abs(mzFromMass(mass, "H+", 1) - (expected + PROTON)) < 1e-9);
  assert.ok(Math.abs(mzFromMass(mass, "H+", 2) - (expected + 2 * PROTON) / 2) < 1e-9);
});

test("negative proton and sodium adduct restrictions", () => {
  assert.ok(mzFromMass(200, "H-", 1) < 200);
  assert.ok(mzFromMass(200, "Na+", 1) > 200);
  assert.throws(() => mzFromMass(200, "Na+", 2), RangeError);
  assert.throws(() => mzFromMass(200, "H+", 0), RangeError);
});

test("reject invalid compositions and unreasonable search spaces", () => {
  assert.throws(() => compositionMass({Hex: -1}), RangeError);
  assert.throws(() => compositionMass({Hex: 1.1}), RangeError);
  assert.throws(() => compositionMass({}), RangeError);
  assert.throws(() => generateCandidates({Hex: 10, HexNAc: 10, Fuc: 10, NeuAc: 10, NeuGc: 10}), RangeError);
});

test("parse numeric or CSV peaks and reject malformed values", () => {
  assert.deepEqual(parsePeaks("mz,intensity\n100.5,30\n201,40"), [
    {mz:100.5, intensity:30},{mz:201, intensity:40}
  ]);
  assert.deepEqual(parsePeaks("100.5\n201"), [
    {mz:100.5, intensity:null},{mz:201, intensity:null}
  ]);
  assert.throws(() => parsePeaks("mz,intensity\n-1,10"), /Invalid peak/);
  assert.throws(() => parsePeaks("mz,intensity\nfoo,10"), /Invalid peak/);
  assert.throws(() => parsePeaks("mz,intensity\n100,-2"), /Invalid peak/);
});

test("annotates correct mass and respects 10 ppm tolerance", () => {
  const candidates = generateCandidates({Hex:3,HexNAc:2,Fuc:1,NeuAc:0,NeuGc:0});
  const target = candidates.find(c => c.composition === "Hex(3)HexNAc(2)Fuc(1)");
  assert.ok(target);
  const peaks = [{mz:target.mz * (1 + 5e-6), intensity:100},
                 {mz:50, intensity:null}];
  const result = annotatePeaks(peaks, candidates, 10);
  assert.equal(result[0].matches[0].composition, target.composition);
  assert.ok(Math.abs(result[0].matches[0].ppm - 5) < 0.001);
  assert.equal(result[1].totalMatches, 0);
  const csv = resultsCsv(result);
  assert.match(csv, /Hex\(3\)HexNAc\(2\)Fuc\(1\)/);
  assert.equal(csv.split("\n").length, result[0].matches.length + 3);
});
