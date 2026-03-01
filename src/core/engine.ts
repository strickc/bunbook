import { readFile, writeFile, unlink } from "fs/promises";
import { spawn } from "bun";
import { join } from "path";

export interface BunbookBlock {
  code: string;
  lineStart: number;
  lineEnd: number;
}

export interface NotebookChunk {
    type: 'markdown' | 'buneval';
    content: string;
    blockIndex?: number; // Only for buneval blocks
}

export interface BunbookResult {
  originalLines: string[];
  chunks: NotebookChunk[];
  blocks: BunbookBlock[];
  outputs: Record<number, string[]>;
  stderr: string;
  timestamp: string;
}

export async function parseBunbook(filePath: string): Promise<{ lines: string[]; blocks: BunbookBlock[]; chunks: NotebookChunk[] }> {
  const content = await readFile(filePath, "utf-8");
  const lines = content.split("\n");
  const blocks: BunbookBlock[] = [];
  const chunks: NotebookChunk[] = [];

  let inBlock = false;
  let currentBlock = "";
  let startLine = 0;
  let markdownBuffer: string[] = [];

  const flushMarkdown = () => {
      if (markdownBuffer.length > 0) {
          chunks.push({ type: 'markdown', content: markdownBuffer.join('\n').trim() });
          markdownBuffer = [];
      }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith("```buneval")) {
      flushMarkdown();
      inBlock = true;
      currentBlock = "";
      startLine = i;
    } else if (trimmed.startsWith("```") && inBlock) {
      const block = { code: currentBlock, lineStart: startLine, lineEnd: i };
      blocks.push(block);
      chunks.push({ type: 'buneval', content: currentBlock.trim(), blockIndex: blocks.length - 1 });
      inBlock = false;
    } else if (inBlock) {
      currentBlock += line + "\n";
    } else {
        // We are in Markdown. Check if this line starts a new section (header)
        if (trimmed.startsWith("#")) {
            // It's a header. Flush existing buffer to start a new chunk
            flushMarkdown();
        }
        markdownBuffer.push(line);
    }
  }
  flushMarkdown();

  return { lines, blocks, chunks };
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
  const { lines, blocks, chunks } = await parseBunbook(filePath);

  if (blocks.length === 0) {
    return { originalLines: lines, chunks, blocks: [], outputs: {}, stderr: "", timestamp: new Date().toLocaleTimeString() };
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
  return { originalLines: lines, chunks, blocks, outputs, stderr, timestamp: new Date().toLocaleTimeString() };
}
