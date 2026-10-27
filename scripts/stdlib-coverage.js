// Reports how much of the Lean standard library the runtime covers on each target: of the externs
// in `Init`, `Std`, and `Lean` that a program could call, which ones the runtime implements. Also
// lists the externs the runtime implements that are not externs in the current toolchain, which no
// program can call.
//
// Prints a summary by default. With `--html <file>`, instead writes a self-contained HTML report,
// with every extern's status, to `<file>`.
//
// Requires the compiler to be built with `lake build`.
//
// Usage: node scripts/stdlib-coverage.js [--html <file>]

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runtimeExterns } from "./runtime-externs.js";

const root = join(import.meta.dirname, "..");
const compiler = join(root, ".lake", "build", "bin", "leanscript");
const toolchain = readFileSync(join(root, "lean-toolchain"), "utf8").trim();

const targets = [
  { id: "node", label: "Node", conditions: [] },
  { id: "browser", label: "Browser", conditions: ["browser"] },
];
const libraries = ["Init", "Std", "Lean"];

/** Strips the `_private.<module>.0.` prefix from the name of a private declaration. */
const userName = (name) => name.replace(/^_private\.(?:[^.]+\.)*?0\./, "");

/** The namespace of `name`, or the empty string for a top-level name. */
function namespaceOf(name) {
  const i = userName(name).lastIndexOf(".");
  return i === -1 ? "" : userName(name).slice(0, i);
}

function collect() {
  const implemented = Object.fromEntries(
    targets.map(({ id, conditions }) => [id, new Set(runtimeExterns(conditions))]),
  );
  const externs = execFileSync(compiler, ["stdlib-externs"], { encoding: "utf8" })
    .trimEnd()
    .split("\n")
    .map((line) => {
      const [name, module] = line.split("\t");
      return {
        name,
        module,
        library: module.split(".")[0],
        namespace: namespaceOf(name),
        targets: targets.filter(({ id }) => implemented[id].has(name)).map(({ id }) => id),
      };
    });
  const known = new Set(externs.map(({ name }) => name));
  const stale = [...new Set(Object.values(implemented).flatMap((names) => [...names]))]
    .filter((name) => !known.has(name))
    .sort();
  return { externs, stale };
}

/** Counts the externs in `externs` that each target implements. */
function tally(externs) {
  const counts = { total: externs.length };
  for (const { id } of targets) {
    counts[id] = externs.filter((e) => e.targets.includes(id)).length;
  }
  return counts;
}

const percent = (n, total) => (total === 0 ? 0 : (100 * n) / total);

function printSummary({ externs, stale }) {
  const rows = [...libraries, "Total"].map((library) => {
    const counts = tally(
      library === "Total" ? externs : externs.filter((e) => e.library === library),
    );
    return [
      library,
      ...targets.map(({ id }) => {
        const pct = percent(counts[id], counts.total).toFixed(1);
        return `${counts[id]}/${counts.total} (${pct}%)`;
      }),
    ];
  });
  const table = [["Library", ...targets.map(({ label }) => label)], ...rows];
  const widths = table[0].map((_, i) => Math.max(...table.map((row) => row[i].length)));
  for (const row of table) {
    console.log(row.map((cell, i) => cell.padEnd(widths[i])).join("  "));
  }
  console.log(`\n${stale.length} runtime externs are not externs in ${toolchain}.`);
}

const escapeHtml = (s) =>
  s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

/** The status of an extern, which selects its color in the report. */
function status({ targets: ts }) {
  if (ts.length === targets.length) {
    return "all";
  }
  return ts.length === 0 ? "none" : "some";
}

function statusLabel(extern) {
  switch (status(extern)) {
    case "all":
      return "every target";
    case "none":
      return "no target";
    default:
      return (
        extern.targets.map((id) => targets.find((t) => t.id === id).label).join(", ") + " only"
      );
  }
}

function renderBar(n, total) {
  const pct = percent(n, total);
  return `<div class="bar" role="img" aria-label="${pct.toFixed(1)}%"><span style="width:${pct}%"></span></div>`;
}

function renderSummary(externs) {
  const head = targets.map(({ label }) => `<th scope="col">${label}</th>`).join("");
  const rows = [...libraries, "Total"].map((library) => {
    const subset = library === "Total" ? externs : externs.filter((e) => e.library === library);
    const counts = tally(subset);
    const cells = targets
      .map(({ id }) => {
        const pct = percent(counts[id], counts.total);
        return `<td><div class="meter">${renderBar(counts[id], counts.total)}<span class="pct">${pct.toFixed(1)}%</span><span class="frac">${counts[id]} / ${counts.total}</span></div></td>`;
      })
      .join("");
    const cls = library === "Total" ? ' class="total"' : "";
    return `<tr${cls}><th scope="row">${library}</th>${cells}</tr>`;
  });
  return `<div class="scroll"><table class="summary"><thead><tr><th scope="col">Library</th>${head}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`;
}

function renderNamespace(namespace, externs) {
  const counts = tally(externs);
  const cells = externs
    .map((e) => {
      const name = escapeHtml(userName(e.name));
      return `<i class="cell ${status(e)}" title="${name}: ${statusLabel(e)}" data-name="${name.toLowerCase()}"></i>`;
    })
    .join("");
  const missing = externs.filter((e) => status(e) !== "all");
  const list = missing.length
    ? `<details><summary>${missing.length} not on every target</summary><ul>${missing
        .map(
          (e) =>
            `<li><code>${escapeHtml(userName(e.name))}</code> <span class="note">${statusLabel(e)}</span></li>`,
        )
        .join("")}</ul></details>`
    : "";
  const summary = targets
    .map(({ id, label }) => `<span>${label} ${counts[id]}/${counts.total}</span>`)
    .join("");
  return `<div class="ns" data-ns="${escapeHtml(namespace.toLowerCase())}"><div class="ns-head"><code>${escapeHtml(namespace || "(top level)")}</code><span class="counts">${summary}</span></div><div class="cells">${cells}</div>${list}</div>`;
}

function renderLibrary(library, externs) {
  const byNamespace = Map.groupBy(
    externs.filter((e) => e.library === library),
    (e) => e.namespace,
  );
  const sorted = [...byNamespace].sort(
    ([a, x], [b, y]) => y.length - x.length || a.localeCompare(b),
  );
  const counts = tally(externs.filter((e) => e.library === library));
  const sub = targets.map(({ id, label }) => `${label} ${counts[id]}/${counts.total}`).join(" · ");
  return `<section class="library"><h2>${library} <span class="sub">${sub}</span></h2>${sorted
    .map(([ns, es]) => renderNamespace(ns, es))
    .join("")}</section>`;
}

function renderHtml({ externs, stale }) {
  const generated = new Date().toISOString().slice(0, 10);
  const total = tally(externs);
  const legend = [
    ["all", "Every target"],
    ["some", "Some targets"],
    ["none", "Not implemented"],
  ]
    .map(([cls, label]) => `<span><i class="cell ${cls}"></i>${label}</span>`)
    .join("");
  const staleList = stale.map((name) => `<li><code>${escapeHtml(name)}</code></li>`).join("");
  return `<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>LeanScript stdlib coverage</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&display=swap">
<style>
/* Layout: a single column; a summary table, then one strip of cells per namespace. */
:root {
  --bg: #f7f8fa;
  --surface: #ffffff;
  --fg: #1b1f2a;
  --muted: #5d6475;
  --line: #dde1e8;
  --accent: #2c5fb3;
  --ok: #2f8a5b;
  --partial: #c98a12;
  --gap: #d3d7df;
  --sans: "IBM Plex Sans", system-ui, -apple-system, sans-serif;
  --mono: "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #12151c; --surface: #1a1e27; --fg: #e4e7ee; --muted: #9aa2b4; --line: #2c3240;
    --accent: #7ea6ec; --ok: #4fbf84; --partial: #e2a83a; --gap: #343b4a; color-scheme: dark;
  }
}
:root[data-theme="dark"] {
  --bg: #12151c; --surface: #1a1e27; --fg: #e4e7ee; --muted: #9aa2b4; --line: #2c3240;
  --accent: #7ea6ec; --ok: #4fbf84; --partial: #e2a83a; --gap: #343b4a; color-scheme: dark;
}
* { box-sizing: border-box; }
body {
  background: var(--bg); color: var(--fg); font-family: var(--sans); font-size: 15px; line-height: 1.5;
  padding-left: max(16px, env(safe-area-inset-left, 0px));
  padding-right: max(16px, env(safe-area-inset-right, 0px));
  padding-block: 32px 64px;
}
main { max-width: 1040px; margin: 0 auto; display: grid; gap: 40px; }
header { display: grid; gap: 6px; }
h1 { font-size: 28px; font-weight: 600; margin: 0; text-wrap: balance; }
h2 { font-size: 18px; font-weight: 600; margin: 0 0 12px; display: flex; flex-wrap: wrap; gap: 4px 12px; align-items: baseline; }
.sub, .meta, .note, .counts { color: var(--muted); font-size: 13px; font-weight: 400; font-variant-numeric: tabular-nums; }
.lede { max-width: 68ch; margin: 0; }
code { font-family: var(--mono); font-size: 13px; }
.scroll { overflow-x: auto; }
table.summary { border-collapse: collapse; width: 100%; background: var(--surface); border: 1px solid var(--line); border-radius: 6px; }
.summary th, .summary td { padding: 10px 14px; text-align: left; border-top: 1px solid var(--line); }
.summary thead th { border-top: 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); font-weight: 500; }
.summary tr.total th, .summary tr.total td { font-weight: 600; border-top: 2px solid var(--line); }
.meter { display: grid; grid-template-columns: minmax(80px, 1fr) 4.5em auto; gap: 12px; align-items: center; font-variant-numeric: tabular-nums; }
.pct { text-align: right; }
.frac { color: var(--muted); font-size: 13px; font-weight: 400; }
.bar { height: 8px; background: var(--gap); border-radius: 4px; overflow: hidden; }
.bar span { display: block; height: 100%; background: var(--ok); }
.controls { display: flex; flex-wrap: wrap; gap: 12px 24px; align-items: center; justify-content: space-between; }
.legend { display: flex; flex-wrap: wrap; gap: 8px 16px; font-size: 13px; color: var(--muted); }
.legend span { display: inline-flex; align-items: center; gap: 6px; }
input[type="search"] { font: inherit; font-family: var(--mono); font-size: 13px; padding: 6px 10px; border: 1px solid var(--line); border-radius: 4px; background: var(--surface); color: var(--fg); width: min(100%, 280px); }
input[type="search"]:focus-visible, summary:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.library { display: grid; gap: 4px; }
.ns { padding: 12px 0; border-top: 1px solid var(--line); display: grid; gap: 8px; min-width: 0; }
.ns-head { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 4px 16px; }
.ns-head code { font-weight: 500; overflow-wrap: anywhere; }
.counts { display: flex; gap: 12px; }
.cells { display: flex; flex-wrap: wrap; gap: 3px; }
.cell { display: inline-block; width: 12px; height: 12px; border-radius: 2px; background: var(--gap); }
.cell.all { background: var(--ok); }
.cell.some { background: var(--partial); }
.cell.dim { opacity: 0.15; }
details summary { cursor: pointer; color: var(--accent); font-size: 13px; }
details ul { margin: 8px 0 0; padding: 0; list-style: none; columns: 2 320px; column-gap: 24px; }
details li { break-inside: avoid; padding: 1px 0; overflow-wrap: anywhere; }
.stale p { max-width: 68ch; margin: 0 0 12px; }
</style>
<main>
  <header>
    <h1>Stdlib coverage</h1>
    <p class="meta">${escapeHtml(toolchain)} · generated ${generated} by <code>scripts/stdlib-coverage.js</code></p>
    <p class="lede">Of the ${total.total} externs in <code>Init</code>, <code>Std</code>, and <code>Lean</code> that a program can call, these are the ones the runtime implements on each target. Externs that a Lean declaration implements through <code>@[export]</code> are not counted, as the compiler calls that declaration instead.</p>
  </header>
  ${renderSummary(externs)}
  <div class="controls">
    <div class="legend">${legend}</div>
    <input type="search" id="filter" placeholder="Filter by name" aria-label="Filter externs by name">
  </div>
  ${libraries.map((library) => renderLibrary(library, externs)).join("")}
  <section class="stale">
    <h2>Not externs in this toolchain <span class="sub">${stale.length}</span></h2>
    <p>The runtime implements these, but no program compiled with ${escapeHtml(toolchain)} can call them, because the toolchain has no extern by that name.</p>
    <details><summary>Show ${stale.length} names</summary><ul>${staleList}</ul></details>
  </section>
</main>
<script>
  const filter = document.getElementById("filter");
  filter.addEventListener("input", () => {
    const q = filter.value.trim().toLowerCase();
    for (const ns of document.querySelectorAll(".ns")) {
      let any = false;
      for (const cell of ns.querySelectorAll(".cell")) {
        const hit = !q || cell.dataset.name.includes(q);
        cell.classList.toggle("dim", !hit);
        any ||= hit;
      }
      ns.hidden = !any;
    }
  });
</script>
`;
}

const data = collect();
const htmlIndex = process.argv.indexOf("--html");
if (htmlIndex === -1) {
  printSummary(data);
} else {
  const output = process.argv[htmlIndex + 1];
  writeFileSync(output, renderHtml(data));
}
