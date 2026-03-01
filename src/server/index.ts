import { watch, type FSWatcher } from "fs";
import { join } from "path";
import { readdir } from "fs/promises";
import { runNotebook } from "../core/engine.js";

const port = process.env.PORT || 3000;
let currentFilePath = process.argv[2] || null;
let watcher: FSWatcher | null = null;

const publicDir = join(import.meta.dir, "public");

const server = Bun.serve({
  port,
  async fetch(req) {
    const url = new URL(req.url);

    if (url.pathname === "/ws") {
      const upgraded = server.upgrade(req);
      if (upgraded) return undefined;
    }

    if (url.pathname === "/api/files") {
      const files = await scanForBunbooks(process.cwd());
      return Response.json({ files, current: currentFilePath });
    }

    if (url.pathname === "/api/notebook") {
      const fileParam = url.searchParams.get("file");
      if (fileParam) {
        currentFilePath = fileParam;
        setupWatcher(currentFilePath);
      }
      
      if (!currentFilePath) {
        return new Response("No file selected", { status: 400 });
      }
      
      try {
        const result = await runNotebook(currentFilePath);
        return Response.json(result);
      } catch (e) {
        return new Response(String(e), { status: 500 });
      }
    }

    let path = url.pathname === "/" ? "/index.html" : url.pathname;
    const file = Bun.file(join(publicDir, path));
    if (await file.exists()) {
      return new Response(file);
    }

    return new Response("Not Found", { status: 404 });
  },
  websocket: {
    open(ws) {
      ws.subscribe("notebook-updates");
    },
    message(ws, message) {},
    close(ws) {
      ws.unsubscribe("notebook-updates");
    },
  },
});

async function scanForBunbooks(dir: string, baseDir = ""): Promise<string[]> {
  const entries = await readdir(join(dir, baseDir), { withFileTypes: true });
  let files: string[] = [];

  for (const entry of entries) {
    const fullRelativePath = join(baseDir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      files = [...files, ...(await scanForBunbooks(dir, fullRelativePath))];
    } else if (entry.name.endsWith(".bunbk.md")) {
      files.push(fullRelativePath);
    }
  }

  return files;
}

function setupWatcher(path: string) {
    if (watcher) watcher.close();
    console.log(`Watching: ${path}`);
    watcher = watch(path, (event, filename) => {
        server.publish("notebook-updates", JSON.stringify({ type: "reload", file: path }));
    });
}

if (currentFilePath) {
    setupWatcher(currentFilePath);
}

console.log(`Bunbook Server started at http://localhost:${port}`);
