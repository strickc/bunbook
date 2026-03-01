import { watch, type FSWatcher } from "fs";
import { join } from "path";
import { readdir } from "fs/promises";
import { runNotebook } from "../core/engine.js";

async function buildFrontend() {
  const frontendDir = join(import.meta.dir, "frontend");
  const publicDir = join(import.meta.dir, "public");
  
  console.log("Building frontend...");
  await Bun.build({
    entrypoints: [join(frontendDir, "main.ts")],
    outdir: publicDir,
    naming: "bundle.js",
    minify: true,
  });
  
  await Bun.write(join(publicDir, "index.html"), await Bun.file(join(frontendDir, "index.html")).text());
  await Bun.write(join(publicDir, "style.css"), await Bun.file(join(frontendDir, "style.css")).text());
}

await buildFrontend();

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
      if (!currentFilePath) return new Response("No file selected", { status: 400 });
      
      try {
        const result = await runNotebook(currentFilePath);
        return Response.json(result);
      } catch (e) {
        return new Response(String(e), { status: 500 });
      }
    }

    if (url.pathname === "/api/save-block" && req.method === "POST") {
      const { file, blockIndex, code } = await req.json() as { file: string, blockIndex: number, code: string };
      await saveBlock(file, blockIndex, code);
      // Immediately run the notebook and return the NEW results to the browser
      const result = await runNotebook(file);
      return Response.json(result);
    }

    let path = url.pathname === "/" ? "/index.html" : url.pathname;
    const file = Bun.file(join(publicDir, path));
    if (await file.exists()) return new Response(file);

    return new Response("Not Found", { status: 404 });
  },
  websocket: {
    open(ws) { ws.subscribe("notebook-updates"); },
    message(ws, message) {},
    close(ws) { ws.unsubscribe("notebook-updates"); },
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

async function saveBlock(filePath: string, blockIndex: number, newCode: string) {
    const fullPath = join(process.cwd(), filePath);
    const content = await Bun.file(fullPath).text();
    const lines = content.split("\n");
    
    let blockCount = 0;
    let inBlock = false;
    let startLine = -1;
    let endLine = -1;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith("```buneval")) {
            if (blockCount === blockIndex) startLine = i;
            inBlock = true;
        } else if (line.startsWith("```") && inBlock) {
            if (blockCount === blockIndex) {
                endLine = i;
                break;
            }
            inBlock = false;
            blockCount++;
        }
    }

    if (startLine !== -1 && endLine !== -1) {
        const linesBefore = lines.slice(0, startLine + 1);
        const linesAfter = lines.slice(endLine);
        const newLines = [
            ...linesBefore,
            newCode,
            ...linesAfter
        ];
        await Bun.write(fullPath, newLines.join("\n"));
        console.log(`Saved block ${blockIndex} to ${filePath}`);
    }
}

function setupWatcher(path: string) {
    if (watcher) watcher.close();
    console.log(`Watching: ${path}`);
    watcher = watch(path, (event, filename) => {
        server.publish("notebook-updates", JSON.stringify({ type: "reload", file: path }));
    });
}

if (currentFilePath) setupWatcher(currentFilePath);
console.log(`Bunbook Server started at http://localhost:${port}`);
