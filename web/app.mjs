import {
  compositionMass, mzFromMass, parsePeaks, generateCandidates, annotatePeaks, resultsCsv
} from "./annotator.mjs";

const $ = id => document.getElementById(id);
let currentResults = null;
function report(message) {
  $("error").textContent = message;
  $("error").hidden = !message;
}
function bounds() {
  return Object.fromEntries([
    ["Hex", "hex"], ["HexNAc", "hexnac"], ["Fuc", "fuc"],
    ["NeuAc", "neuac"], ["NeuGc", "neugc"]
  ].map(([key,id]) => {
    const element = $(id);
    const n = Number(element.value);
    if (!element.value || !Number.isSafeInteger(n) || n < 0 || n > 40) {
      throw new RangeError(key + " maximum must be a whole number from 0 to 40");
    }
    return [key,n];
  }));
}
function draw(results, candidateCount) {
  const hitPeaks = results.filter(row => row.totalMatches > 0).length;
  const total = results.reduce((sum,row) => sum + row.totalMatches, 0);
  $("summary").textContent = results.length + " peaks · " + hitPeaks +
    " with candidate matches · " + candidateCount + " compositions searched · " +
    total + " matches (up to 20 shown per peak)";
  const body = $("result-rows");
  body.replaceChildren();
  let shown = 0;
  for (const row of results) {
    const hits = row.matches.length ? row.matches : [null];
    for (const hit of hits) {
      if (shown >= 300) break;
      const tr = document.createElement("tr");
      const cells = [row.index, row.mz.toFixed(5),
        row.intensity === null ? "—" : String(row.intensity),
        hit?.composition ?? "No match",
        hit ? hit.mz.toFixed(5) : "—",
        hit ? hit.ppm.toFixed(2) : "—"];
      for (const value of cells) {
        const td = document.createElement("td");
        td.textContent = String(value);
        tr.appendChild(td);
      }
      body.appendChild(tr);
      shown++;
    }
    if (shown >= 300) break;
  }
  $("table-note").textContent = total + results.filter(r => !r.totalMatches).length > shown ?
    "Showing the first 300 rows; download CSV for all peaks and their top 20 candidate matches." : "";
  $("results").hidden = false;
  $("download").disabled = false;
}

$("run").addEventListener("click", () => {
  report("");
  $("results").hidden = true;
  $("download").disabled = true;
  currentResults = null;
  try {
    const peaks = parsePeaks($("peaks").value);
    const charge = Number($("charge").value);
    const adduct = $("adduct").value;
    const limits = bounds();
    const ppm = Number($("ppm").value);
    const candidates = generateCandidates(limits, adduct, charge);
    if (!candidates.length) throw new Error("Allow at least one residue in the composition bounds");
    currentResults = annotatePeaks(peaks, candidates, ppm);
    draw(currentResults, candidates.length);
  } catch (error) {
    report(error instanceof Error ? error.message : "Cannot process input");
  }
});

$("file").addEventListener("change", async event => {
  report("");
  const file = event.target.files?.[0];
  if (!file) return;
  if (file.size > 1000000) {
    report("File exceeds 1 MB");
    return;
  }
  try {
    $("peaks").value = await file.text();
  } catch {
    report("Cannot read the selected file");
  }
});

$("adduct").addEventListener("change", () => {
  const sodium = $("adduct").value === "Na+";
  if (sodium) $("charge").value = "1";
  $("charge").disabled = sodium;
});

$("example").addEventListener("click", () => {
  const expected = mzFromMass(compositionMass({Hex:3,HexNAc:2,Fuc:1}));
  $("peaks").value = "mz,intensity\n" + (expected * (1 + 3e-6)).toFixed(6) +
    ",100000\n500.000000,1250";
  $("adduct").value = "H+";
  $("charge").value = "1";
  $("charge").disabled = false;
  ["hex","hexnac","fuc","neuac","neugc"].forEach((id,i) =>
    $(id).value = [6,5,2,2,0][i]);
  $("ppm").value = "10";
  $("run").click();
});

$("download").addEventListener("click", () => {
  if (!currentResults) return;
  const blob = new Blob([resultsCsv(currentResults)], {type:"text/csv;charset=utf-8"});
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "glycan-composition-matches.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
