// Serves the site from `dist/`, and rebuilds it as its sources change. Pages reload when anything in
// `dist/` changes.
//
// Usage: node dev.js (set PORT to change the port, which is 3000 by default)

import { spawn } from "node:child_process";
import { existsSync, watch } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, sep } from "node:path";

const root = import.meta.dirname;
const dist = join(root, "dist");
const port = Number(process.env.PORT ?? 3000);

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".woff2": "font/woff2",
};

const reloadScript = `<script>new EventSource("/__reload").onmessage = () => location.reload();</script>`;

/** Runs `command` in the site's directory, and resolves with its exit code. */
function run(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd: root, stdio: "inherit" });
    child.on("exit", (code) => resolve(code ?? 1));
  });
}

/** Returns a function that calls `f` once no calls have come in for `ms` milliseconds. */
function debounce(ms, f) {
  let timer;
  return () => {
    clearTimeout(timer);
    timer = setTimeout(f, ms);
  };
}

let generating = false;
let queued = false;

/** Generates the pages, running the generator again afterward if a change comes in meanwhile. */
async function generate() {
  if (generating) {
    queued = true;
    return;
  }
  generating = true;
  do {
    queued = false;
    // Tailwind writes `style.css` into `dist/` too, so the generator mustn't clear it.
    await run("lake", ["exe", "site", "--no-clean"]);
  } while (queued);
  generating = false;
}

/** Returns the path of the file in `dist/` for the request path `pathname`, if any. */
async function resolveFile(pathname) {
  const path = join(dist, decodeURIComponent(pathname));
  if (path !== dist && !path.startsWith(dist + sep)) {
    return null;
  }
  try {
    const stats = await stat(path);
    if (stats.isDirectory()) {
      return resolveFile(join(pathname, "index.html"));
    }
    return path;
  } catch {
    return null;
  }
}

const clients = new Set();

const server = createServer(async (req, res) => {
  const { pathname } = new URL(req.url, "http://localhost");
  if (pathname === "/__reload") {
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store" });
    clients.add(res);
    req.on("close", () => clients.delete(res));
    return;
  }

  const path = await resolveFile(pathname);
  if (path === null) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found\n");
    return;
  }
  const type = contentTypes[extname(path)] ?? "application/octet-stream";
  let body = await readFile(path);
  if (extname(path) === ".html") {
    body = body.toString("utf8").replace("</body>", `${reloadScript}</body>`);
  }
  res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(body);
});

// The first build clears `dist/`, so that it doesn't have files from earlier builds.
await run("lake", ["exe", "site"]);

const tailwind = spawn(
  join(root, "node_modules", ".bin", "tailwindcss"),
  ["-i", "styles.css", "-o", "dist/style.css", "--watch=always"],
  { cwd: root, stdio: ["ignore", "inherit", "inherit"] },
);
process.on("exit", () => tailwind.kill());
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => process.exit());
}

const regenerate = debounce(50, generate);
for (const dir of ["Site", "Ssg", "data", "static"]) {
  // `static/` is optional.
  if (existsSync(join(root, dir))) {
    watch(join(root, dir), { recursive: true }, regenerate);
  }
}
watch(join(root, "Main.lean"), regenerate);

const reload = debounce(100, () => {
  for (const client of clients) {
    client.write("data: reload\n\n");
  }
});
watch(dist, { recursive: true }, reload);

server.listen(port, () => {
  console.log(`Serving the site at http://localhost:${port}`);
});
