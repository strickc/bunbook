#!/usr/bin/env bun
import { readFile, writeFile } from "fs/promises";
import { join } from "path";
import { parseArgs } from "util";
import { runNotebook } from "./core/engine.js";

async function run() {
  const { values, positionals } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      output: { type: "string", short: "o" },
      save: { type: "boolean", short: "s" },
      "no-code": { type: "boolean" },
      agents: { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
    strict: true,
    allowPositionals: true,
  }) as { values: { output?: string, save?: boolean, "no-code"?: boolean, agents?: boolean, help?: boolean }, positionals: string[] };

  if (values.agents) {
    const agentsPath = join(import.meta.dir, "..", "AGENTS.md");
    try {
      const agentsMd = await readFile(agentsPath, "utf-8");
      console.log(agentsMd);
    } catch (e) {
      console.error("Error: Could not find AGENTS.md");
    }
    process.exit(0);
  }

  if (values.help || (positionals.length === 0 && !values.agents)) {
    console.log(`
Bunbook CLI - Execute Markdown notebooks with Bun

Usage:
  bunbook <file.bunbk.md> [options]

Options:
  -s, --save             Save output to <name>.bkout.md
  -o, --output <path>    Save output to specified path
  --no-code              Exclude original code blocks in output
  --agents               Print the AGENTS.md guide
  -h, --help             Show help
    `);
    process.exit(0);
  }

  const filePath = positionals[0];
  const result = await runNotebook(filePath);

  let finalMarkdown = "";
  const isSaving = values.save || values.output;
  
  for (let i = 0; i < result.originalLines.length; i++) {
    const blockIndex = result.blocks.findIndex((b) => b.lineStart === i);
    if (blockIndex !== -1) {
      const block = result.blocks[blockIndex];
      if (!values["no-code"]) {
        if (!isSaving) finalMarkdown += `\x1b[36m`;
        finalMarkdown += `\`\`\`typescript\n${block.code.trim()}\n\`\`\`\n`;
        if (!isSaving) finalMarkdown += `\x1b[39m`;
      }
      const outputs = result.outputs.get(blockIndex) || [];
      if (outputs.length > 0) {
        if (!isSaving) finalMarkdown += `\x1b[32mOutput:\x1b[39m\n`; else finalMarkdown += `\n**Output:**\n`;
        finalMarkdown += `\`\`\`text\n${outputs.join("\n")}\n\`\`\`\n`;
      }
      i = block.lineEnd;
    } else {
      finalMarkdown += result.originalLines[i] + "\n";
    }
  }

  if (isSaving) {
    const outPath = values.output || filePath.replace(/\.bunbk\.md$/, "") + ".bkout.md";
    await writeFile(outPath, finalMarkdown);
    console.log(`Results saved to: ${outPath}`);
  } else {
    console.log(finalMarkdown);
  }

  if (result.stderr) console.error("\x1b[31mRuntime Errors:\x1b[39m\n", result.stderr);
}

run();
