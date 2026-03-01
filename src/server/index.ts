import { watch } from "fs";
import { join } from "path";
import { runNotebook } from "../core/engine.js";

const port = process.env.PORT || 3000;
const filePath = process.argv[2];

if (!filePath) {
  console.error("Usage: bun run src/server/index.ts <file.bunbk.md>");
  process.exit(1);
}

const fullPath = join(process.cwd(), filePath);
const publicDir = join(import.meta.dir, "public");

const server = Bun.serve({
  port,
  async fetch(req) {
    const url = new URL(req.url);

    // 1. Upgrade to WebSocket for live updates
    if (url.pathname === "/ws") {
      const upgraded = server.upgrade(req);
      if (upgraded) return undefined;
    }

    // 2. API: Get latest notebook data
    if (url.pathname === "/api/notebook") {
      const result = await runNotebook(fullPath);
      return Response.json(result);
    }

    // 3. Static File Server
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
      console.log("Client connected via WebSocket");
    },
    message(ws, message) {},
    close(ws) {
      ws.unsubscribe("notebook-updates");
    },
  },
});

// Watch for file changes
watch(fullPath, async (event, filename) => {
  if (filename) {
    console.log(`File changed: ${filename}. Notifying clients...`);
    server.publish("notebook-updates", JSON.stringify({ type: "reload" }));
  }
});

console.log(`Bunbook Server started at http://localhost:${port}`);
console.log(`Watching: ${fullPath}`);
