# Bunbook for Agents

Bunbook is a high-performance, single-context notebook format based on Markdown and powered by Bun. It allows for seamless execution of JavaScript/TypeScript code blocks within a persistent environment.

## File Format: `.bunbk.md`
Any Markdown file is a valid Bunbook, but only code blocks marked with ````buneval``` will be executed.

### Core Features
- **Persistent Context**: Variables, functions, and classes defined in one block are available in all subsequent blocks.
- **Top-Level Await**: You can use `await` directly in any block.
- **Bun APIs**: Full access to `Bun.file`, `Bun.password`, `Bun.sql`, and modern web APIs like `fetch`.
- **Re-declaration Support**: `const` and `let` are automatically transpiled to `var` at the top level, allowing you to re-run and edit blocks without "already defined" errors.

## CLI Usage

```bash
# Execute and output to terminal
bun run bunbook.ts my_file.bunbk.md

# Execute and save to a .bkout.md file
bun run bunbook.ts my_file.bunbk.md -o

# Execute and only show outputs (hide source code)
bun run bunbook.ts my_file.bunbk.md --no-code -o
```

## Tips for Agents
1.  **Iterative Development**: Use Bunbook to prototype complex logic or data processing steps across multiple blocks.
2.  **Shared State**: Use a global `state` object or simple top-level variables to pass data between cells.
3.  **Use `console.table()`**: For data arrays or complex objects, `console.table(data)` will be rendered as a beautiful, readable HTML table in the web server and CLI.
4.  **Error Handling**: Each block is wrapped in a `try/catch`. If one block fails, the execution continues to the next block, allowing you to see partial results.
5.  **Async Operations**: Perfect for testing APIs or crawling sites before committing to a full script.

## Example
```markdown
# Analysis

```buneval
const data = await fetch("https://api.example.com/stats").then(r => r.json());
console.log(`Fetched ${data.length} items`);
```

```buneval
const summary = data.map(item => item.value).reduce((a, b) => a + b, 0);
console.log(`Total Value: ${summary}`);
```
```
