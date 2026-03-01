import { expect, test, describe } from "bun:test";
import { parseBunbook, transpile } from "../src/core/engine";
import { writeFile, unlink } from "fs/promises";
import { join } from "path";

describe("Bunbook Engine - Parser", () => {
  test("should extract buneval blocks properly", async () => {
    const md = `
# Title
\`\`\`buneval
const x = 10;
\`\`\`
Text
\`\`\`buneval
console.log(x);
\`\`\`
`;
    const testFile = join(process.cwd(), "test_parser.bunbk.md");
    await writeFile(testFile, md);

    try {
      const { blocks, lines } = await parseBunbook(testFile);
      expect(blocks.length).toBe(2);
    } finally {
      await unlink(testFile);
    }
  });

  test("should skip normal code blocks", async () => {
    const md = `
\`\`\`typescript
const hidden = true;
\`\`\`
\`\`\`buneval
const visible = true;
\`\`\`
`;
    const testFile = join(process.cwd(), "test_skip.bunbk.md");
    await writeFile(testFile, md);

    try {
      const { blocks } = await parseBunbook(testFile);
      expect(blocks.length).toBe(1);
      expect(blocks[0].code.trim()).toBe("const visible = true;");
    } finally {
      await unlink(testFile);
    }
  });
});

describe("Bunbook Engine - Transpiler", () => {
  test("should replace top-level const and let with var", () => {
    const blocks = [{ code: "const x = 1;\nlet y = 2;", lineStart: 0, lineEnd: 2 }];
    const script = transpile(blocks);
    expect(script).toContain("var x = 1;");
    expect(script).toContain("var y = 2;");
    expect(script).not.toContain("const x = 1;");
  });

  test("should handle function declarations", () => {
    const blocks = [{ code: "function hello() { return 1; }", lineStart: 0, lineEnd: 1 }];
    const script = transpile(blocks);
    // Based on the current regex: .replace(/^function\s+([a-zA-Z0-9_$]+)\s*\(/gm, "var $1 = function(");
    expect(script).toContain("var hello = function(");
  });

  test("should wrap blocks with markers and try/catch", () => {
    const blocks = [{ code: "console.log(1);", lineStart: 0, lineEnd: 1 }];
    const script = transpile(blocks);
    expect(script).toContain(">>BUNBOOK_START:0");
    expect(script).toContain(">>BUNBOOK_END:0");
    expect(script).toContain("try {");
    expect(script).toContain("} catch(e) {");
  });
});
