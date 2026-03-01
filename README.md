# Bunbook

**Bunbook** is a lightning-fast, single-context interactive notebook system built for the modern JavaScript/TypeScript ecosystem. It combines the ubiquitous Markdown format with the raw performance of **Bun**.

Think of it as Jupyter Notebooks, but specifically optimized for Bun developers featuring a single script context, integrated Markdown editing, and smart TypeScript IntelliSense.

## Quick Install

Install Bunbook globally on your machine:

```bash
bun install -g github:strickc/bunbook
```

## Key Features

- **Single Execution Context**: Variables and functions defined in one block are available in all subsequent blocks.
- **Markdown Native**: Notebooks are just standard .bunbk.md files. Standard renderers see Markdown; Bunbook sees a dynamic IDE.
- **Click-to-Edit Markdown**: Click any text section to edit it as source; click away to see it rendered as beautiful HTML.
- **Smart IntelliSense**: Full TypeScript support with red squiggles (syntax & semantic checking) and cross-cell variable autocompletion.
- **Auto-Run**: Editing a block automatically re-runs the notebook and updates outputs instantly.
- **Rich Output**: Integrated support for console.table() (rendered as clean HTML tables) and Markdown logs.
- **Bun Power**: Native access to Bun.sql, Bun.file, top-level await, and high-performance shell commands.

## Usage

### 1. Start the Interactive Server
Run this in any directory to scan for notebooks and open the interactive dashboard:

```bash
bunbook --serve
```
*Then visit http://localhost:3000*

### 2. Execute via CLI
Generate a static report from a notebook:

```bash
# Run and see output in terminal
bunbook my_notebook.bunbk.md

# Run and save results to a new .bkout.md file
bunbook my_notebook.bunbk.md --save
```

## File Format: .bunbk.md

Executable blocks are identified by the ```buneval``` code fence:

```markdown
# My Analysis

We can define a shared state:
```buneval
const data = await fetch("https://api.example.com/data").then(r => r.json());
console.log(`Fetched ${data.length} items`);
```

And use it later:
```buneval
console.table(data.slice(0, 5));
```
```

## Advanced Config

- **Custom Port**: bunbook --serve --port 8080
- **Excluding Code**: Use bunbook <file> --no-code --save to generate a report containing only your text and execution results.

## For AI Agents
Check out [AGENTS.md](./AGENTS.md) for specialized tips on how to use Bunbook effectively in an automated or LLM-driven workflow.

---
Built with Bun and CodeMirror 6.
