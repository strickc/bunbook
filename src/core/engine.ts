import { readFile, writeFile, unlink } from "fs/promises";
import { spawn } from "bun";
import { join } from "path";

export interface BunbookBlock {
  code: string;
  lineStart: number;
  lineEnd: number;
}

export interface BunbookResult {
  originalLines: string[];
  blocks: BunbookBlock[];
  outputs: Record<number, string[]>;
  stderr: string;
  timestamp: string;
}

export async function parseBunbook(filePath: string): Promise<{ lines: string[]; blocks: BunbookBlock[] }> {
  const content = await readFile(filePath, "utf-8");
  const lines = content.split("\n");
  const blocks: BunbookBlock[] = [];

  let inBlock = false;
  let currentBlock = "";
  let startLine = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith("```buneval")) {
      inBlock = true;
      currentBlock = "";
      startLine = i;
    } else if (line.startsWith("```") && inBlock) {
      blocks.push({ code: currentBlock, lineStart: startLine, lineEnd: i });
      inBlock = false;
    } else if (inBlock) {
      currentBlock += lines[i] + "\n";
    }
  }

  return { lines, blocks };
}

export function transpile(blocks: BunbookBlock[]): string {
  let script = "";
  blocks.forEach((block, index) => {
    const transpiled = block.code
      .replace(/^const\s+/gm, "var ")
      .replace(/^let\s+/gm, "var ")
      .replace(/^function\s+([a-zA-Z0-9_$]+)\s*\(/gm, "var $1 = function(");

    script += `console.log(">>BUNBOOK_START:${index}");\n`;
    script += `try {\n${transpiled}\n} catch(e) { console.error("\\x1b[31mError in Block ${index}:\\x1b[39m", e); }\n`;
    script += `console.log(">>BUNBOOK_END:${index}");\n`;
  });
  return script;
}

export async function runNotebook(filePath: string): Promise<BunbookResult> {
  const { lines, blocks } = await parseBunbook(filePath);

  if (blocks.length === 0) {
    return { originalLines: lines, blocks: [], outputs: {}, stderr: "", timestamp: new Date().toLocaleTimeString() };
  }

  const script = transpile(blocks);
  const tmpFile = join(process.cwd(), `.bunbook_tmp_${Date.now()}.ts`);
  await writeFile(tmpFile, script);

  const proc = spawn(["bun", "run", tmpFile], { stdout: "pipe", stderr: "pipe" });
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();

  const outputs: Record<number, string[]> = {};
  let currentBlockIndex = -1;
  stdout.split("\n").forEach((line) => {
    if (line.startsWith(">>BUNBOOK_START:")) {
      currentBlockIndex = parseInt(line.split(":")[1]);
      outputs[currentBlockIndex] = [];
    } else if (line.startsWith(">>BUNBOOK_END:")) {
      currentBlockIndex = -1;
    } else if (currentBlockIndex !== -1 && line !== "") {
      outputs[currentBlockIndex]?.push(line);
    }
  });

  await unlink(tmpFile);
  return { originalLines: lines, blocks, outputs, stderr, timestamp: new Date().toLocaleTimeString() };
}
