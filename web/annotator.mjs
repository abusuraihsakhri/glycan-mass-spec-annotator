// Monoisotopic residue masses in Da; neutral released glycan includes terminal H2O.
// Calculations yield composition candidates, not structural or MS/MS identifications.
export const RESIDUES = Object.freeze({
  Hex: 162.0528234315,
  HexNAc: 203.0793725330,
  Fuc: 146.0579088090,
  NeuAc: 291.0954165270,
  NeuGc: 307.0903311490
});
export const WATER = 18.0105646840;
export const PROTON = 1.007276466621;
export const SODIUM_CATION = 22.989218;
const KEYS = Object.keys(RESIDUES);

export function compositionMass(counts) {
  let mass = WATER;
  let total = 0;
  for (const key of KEYS) {
    const n = counts[key] ?? 0;
    if (!Number.isSafeInteger(n) || n < 0 || n > 40) {
      throw new RangeError(key + " count must be an integer between 0 and 40");
    }
    total += n;
    mass += RESIDUES[key] * n;
  }
  if (!total) throw new RangeError("At least one residue is required");
  return mass;
}

export function compositionLabel(counts) {
  return KEYS.filter(k => counts[k]).map(k => k + "(" + counts[k] + ")").join("");
}

export function mzFromMass(mass, adduct = "H+", charge = 1) {
  if (!Number.isFinite(mass) || mass <= 0) throw new RangeError("Invalid neutral mass");
  if (!Number.isSafeInteger(charge) || charge < 1 || charge > 5) {
    throw new RangeError("Charge magnitude must be 1–5");
  }
  if (adduct === "H+") return (mass + charge * PROTON) / charge;
  if (adduct === "H-") return (mass - charge * PROTON) / charge;
  if (adduct === "Na+" && charge === 1) return mass + SODIUM_CATION;
  throw new RangeError("Only singly charged sodium adducts are supported");
}

export function parsePeaks(text) {
  if (typeof text !== "string" || text.length > 1000000) throw new RangeError("Peak text exceeds 1 MB");
  const rows = text.split(/\r?\n/).map((raw, i) => ({raw: raw.trim(), line: i + 1}))
    .filter(({raw}) => raw && !raw.startsWith("#"));
  if (!rows.length) throw new Error("No peaks found");
  if (rows.length > 5001) throw new RangeError("Maximum 5,000 peaks");
  const fields = line => line.split(/[,;\t]/).map(s => s.trim().replace(/^"|"$/g, ""));
  const first = fields(rows[0].raw);
  const hasHeader = /^(m\/z|mz|mass)$/i.test(first[0]);
  let mzCol = 0, intensityCol = 1;
  if (hasHeader) {
    mzCol = first.findIndex(s => /^(m\/z|mz|mass)$/i.test(s));
    intensityCol = first.findIndex(s => /^intensity$/i.test(s));
  }
  const data = rows.slice(hasHeader ? 1 : 0);
  if (!data.length) throw new Error("No numeric peaks found");
  if (data.length > 5000) throw new RangeError("Maximum 5,000 peaks");
  return data.map(({raw, line}) => {
    const cells = fields(raw);
    const mzString = cells[mzCol];
    const intensityString = intensityCol < 0 ? "" : cells[intensityCol];
    const mz = Number(mzString);
    const intensity = intensityString === "" || intensityString === undefined ? null : Number(intensityString);
    if (!mzString || !Number.isFinite(mz) || mz <= 0 || mz > 1000000 ||
        (intensity !== null && (!Number.isFinite(intensity) || intensity < 0))) {
      throw new Error("Invalid peak at line " + line);
    }
    return {mz, intensity};
  });
}

export function generateCandidates(limits, adduct = "H+", charge = 1) {
  let combinations = 1;
  for (const key of KEYS) {
    const n = limits[key] ?? 0;
    if (!Number.isSafeInteger(n) || n < 0 || n > 40) {
      throw new RangeError("Invalid maximum count for " + key);
    }
    combinations *= n + 1;
    if (combinations > 50000) throw new RangeError("Composition search exceeds 50,000 combinations; reduce bounds");
  }
  mzFromMass(WATER, adduct, charge);
  const output = [];
  const counts = {};
  function visit(index) {
    if (index === KEYS.length) {
      if (!KEYS.some(k => counts[k])) return;
      const mass = compositionMass(counts);
      output.push({composition: compositionLabel(counts), mass, mz: mzFromMass(mass, adduct, charge)});
      return;
    }
    const key = KEYS[index];
    for (let n = 0; n <= (limits[key] ?? 0); n++) {
      counts[key] = n;
      visit(index + 1);
    }
  }
  visit(0);
  output.sort((a, b) => a.mz - b.mz);
  return output;
}

export function annotatePeaks(peaks, candidates, tolerancePpm = 10, maximumPerPeak = 20) {
  if (!Number.isFinite(tolerancePpm) || tolerancePpm <= 0 || tolerancePpm > 1000) {
    throw new RangeError("Tolerance must be greater than 0 and no more than 1,000 ppm");
  }
  if (!Number.isSafeInteger(maximumPerPeak) || maximumPerPeak < 1) {
    throw new RangeError("Invalid maximum matches");
  }
  return peaks.map((peak, index) => {
    const delta = peak.mz * tolerancePpm / 1e6;
    let lo = 0, hi = candidates.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (candidates[mid].mz < peak.mz - delta) lo = mid + 1;
      else hi = mid;
    }
    const matches = [];
    while (lo < candidates.length && candidates[lo].mz <= peak.mz + delta) {
      const candidate = candidates[lo++];
      matches.push({...candidate, ppm: (peak.mz - candidate.mz) / candidate.mz * 1e6});
    }
    matches.sort((a,b) => Math.abs(a.ppm) - Math.abs(b.ppm));
    return {index: index + 1, ...peak, matches: matches.slice(0, maximumPerPeak), totalMatches: matches.length};
  });
}

export function resultsCsv(results) {
  const header = "peak_index,observed_mz,intensity,composition,neutral_mass,theoretical_mz,error_ppm,total_matches";
  const lines = [header];
  for (const row of results) {
    const common = [row.index, row.mz, row.intensity ?? ""];
    if (!row.matches.length) {
      lines.push([...common, "", "", "", "", 0].join(","));
    } else for (const hit of row.matches) {
      lines.push([...common, hit.composition, hit.mass.toFixed(6), hit.mz.toFixed(6), hit.ppm.toFixed(3), row.totalMatches].join(","));
    }
  }
  return lines.join("\n") + "\n";
}
