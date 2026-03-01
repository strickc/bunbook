# Bunbook Design Document

## Overview
Bunbook is a Jupyter-like notebook system that uses Markdown (`.bunbk.md`) as its storage format and Bun as its execution engine. It aims for high performance, ease of use with the Bun ecosystem (TypeScript, SQLite, HTTP), and a single-script execution context.

## File Format
- File extension: `.bunbk.md`
- Markdown with a custom code fence: ````buneval```
- Standard code blocks (e.g., ````ts```) are treated as documentation/static code.
- ````buneval``` blocks are executed.

## Core Components

### 1. Transpiler
The transpiler is responsible for:
- Converting `const` and `let` at the top level of each block into `var` to allow for re-declaration during interactive sessions or multiple evaluations.
- Wrapping code to capture return values (optional, for the "implicit return" feature).
- Inserting markers or instrumentation to track which output belongs to which block.

### 2. Execution Context
- **Single Context**: All `buneval` blocks in a file are executed within the same JavaScript environment.
- **Top-Level Await**: Supported by default, as Bun supports it natively.
- **Rich Outputs**: A global `Bunbook` object (or similar) will provide methods like `Bunbook.svg(data)`, `Bunbook.html(data)`, `Bunbook.table(data)` to send non-text data to the frontend.

### 3. CLI Runner (Phase 1)
- Reads a `.bunbk.md` file.
- Extracts all `buneval` blocks.
- Transpiles them into a single temporary Bun script.
- Executes the script and prints the output, grouped by the original blocks.

### 4. Interactive Server (Future Phase)
- HTTP/WebSocket server.
- Uses `remark` for MD parsing.
- Monaco or CodeMirror for editing.
- Hot-reloading of cells.

## Technical Blockers & Solutions

### B1: Variable Re-declaration (Solved via Transpilation)
**Problem**: `const x = 1` followed by `const x = 2` in the same context throws a SyntaxError.
**Solution**: The transpiler replaces top-level `const`/`let` with `var`. This allows re-assignment while maintaining the "feel" of modern JS.

### B2: Output Capturing
**Problem**: How to map `console.log` calls back to specific Markdown blocks when running as a single script?
**Solution**: Inject markers before and after chaque block's code (e.g., `console.log('__BUNBOOK_BLOCK_START:0')`). The runner parses the final output stream to associate logs with blocks.

### B3: Graphics/Rendering
**Problem**: How to handle D3 or Plotly without a browser/DOM?
**Solution**: Bunbook will provide a "Data Bridge". Graphs will be sent as JSON (Plotly) or SVG. The browser frontend will then perform the final render. For the CLI, it can output [Terminal Graphics](https://en.wikipedia.org/wiki/Sixel) or just the URI of an exported image.
