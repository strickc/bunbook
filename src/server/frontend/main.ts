import { EditorView, basicSetup } from "codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { oneDark } from "@codemirror/theme-one-dark";
import { EditorState } from "@codemirror/state";
import { keymap, hoverTooltip } from "@codemirror/view";
import { indentWithTab } from "@codemirror/commands";
import { autocompletion, CompletionContext, CompletionResult } from "@codemirror/autocomplete";
import { lintGutter, linter, Diagnostic } from "@codemirror/lint";
import * as MarkdownIt from "markdown-it";
import { type BunbookResult, type BunbookBlock } from "../../core/engine.js";

// @ts-ignore
const md = new MarkdownIt.default();
const notebookElement = document.getElementById("notebook");
const statusElement = document.getElementById("status");
const fileListElement = document.getElementById("file-list");
const sidebarTitle = document.getElementById("current-filename");

let currentFile: string | null = null;
const editors = new Map<number, EditorView>();

const tsWorker = new Worker("worker.js");
let pendingDiagnostics = new Map<number, Diagnostic[]>();
let diagResolve: ((d: Map<number, Diagnostic[]>) => void) | null = null;

tsWorker.onmessage = (e) => {
    const { type, diagnostics } = e.data;
    if (type === "diagnostics") {
        const { offsets } = notebookProject.getUnifiedSource();
        const results = new Map<number, Diagnostic[]>();
        
        diagnostics.forEach((diag: { start: number, length: number, message: string }) => {
            const mapped = notebookProject.mapOffset(diag.start, offsets);
            if (mapped) {
                if (!results.has(mapped.blockIndex)) results.set(mapped.blockIndex, []);
                results.get(mapped.blockIndex)!.push({
                    from: mapped.localOffset,
                    to: mapped.localOffset + diag.length,
                    severity: "error",
                    message: diag.message
                });
            }
        });
        pendingDiagnostics = results;
        if (diagResolve) diagResolve(results);
    }
};

const notebookProject = {
    getUnifiedSource() {
        let source = "";
        const offsets: { blockIndex: number, start: number, end: number }[] = [];
        let currentOffset = 0;
        const blockIndices = Array.from(editors.keys()).sort((a, b) => a - b);
        for (const index of blockIndices) {
            const editor = editors.get(index);
            if (!editor) continue;
            const code = editor.state.doc.toString();
            source += code + "\n\n";
            offsets.push({ blockIndex: index, start: currentOffset, end: currentOffset + code.length });
            currentOffset += code.length + 2;
        }
        return { source, offsets };
    },
    mapOffset(globalOffset: number, offsets: { blockIndex: number, start: number, end: number }[]) {
        for (const range of offsets) {
            if (globalOffset >= range.start && globalOffset <= range.end) {
                return { blockIndex: range.blockIndex, localOffset: globalOffset - range.start };
            }
        }
        return null;
    }
};

function notebookCompletions(context: CompletionContext): CompletionResult | null {
  const word = context.matchBefore(/\w*/);
  if (!word || (word.from === word.to && !context.explicit)) return null;
  const options: { label: string, type: string, info: string }[] = [];
  const seen = new Set<string>();
  editors.forEach((view, index) => {
    const text = view.state.doc.toString();
    const matches = text.matchAll(/(?:const|let|var|function)\s+([a-zA-Z0-9_$]+)/g);
    for (const match of matches) {
      const name = match[1];
      if (!seen.has(name)) {
        options.push({ label: name, type: 'variable', info: `From Block ${index}` });
        seen.add(name);
      }
    }
  });
  return { from: word.from, options: options };
}

function notebookLinter(view: EditorView) {
    const { source } = notebookProject.getUnifiedSource();
    let activeIndex = -1;
    editors.forEach((v, idx) => { if (v === view) activeIndex = idx; });

    return new Promise<Diagnostic[]>((resolve) => {
        diagResolve = (all: Map<number, Diagnostic[]>) => {
            resolve(all.get(activeIndex) || []);
        };
        tsWorker.postMessage({ type: "update", source });
    });
}

function notebookTooltips() {
  return hoverTooltip((view, pos) => {
    let activeIndex = -1;
    editors.forEach((v, idx) => { if (v === view) activeIndex = idx; });
    
    const blockDiags = pendingDiagnostics.get(activeIndex) || [];
    const found = blockDiags.find(d => pos >= d.from && pos <= d.to);
    
    if (!found) return null;
    return {
      pos: found.from,
      end: found.to,
      above: true,
      create() {
        const dom = document.createElement("div");
        dom.className = "cm-tooltip-lint";
        dom.textContent = found.message;
        return { dom };
      }
    };
  });
}

async function loadFiles() {
  const response = await fetch("/api/files");
  const data = await response.json() as { files: string[], current: string | null };
  if (!fileListElement) return;
  fileListElement.innerHTML = "";
  data.files.forEach(file => {
    const div = document.createElement("div");
    div.className = `file-item ${data.current === file ? 'active' : ''}`;
    div.innerText = file;
    div.addEventListener("click", () => selectFile(file));
    fileListElement.appendChild(div);
  });
  if (data.current && !currentFile) selectFile(data.current);
}

async function selectFile(file: string) {
  currentFile = file;
  if (sidebarTitle) sidebarTitle.innerText = file;
  document.querySelectorAll('.file-item').forEach(el => {
      if (el instanceof HTMLElement) {
          el.classList.toggle('active', el.innerText === file);
      }
  });
  fetchNotebook(file);
}

async function fetchNotebook(file: string | null = currentFile) {
  if (!file) return;
  try {
    const response = await fetch(`/api/notebook?file=${encodeURIComponent(file)}`);
    const data = await response.json() as BunbookResult;
    renderNotebook(data);
  } catch (err) { console.error("Error fetching notebook:", err); }
}

function renderNotebook(data: BunbookResult) {
  if (!notebookElement) return;
  notebookElement.innerHTML = "";
  editors.clear();
  let currentGroup: string[] = [];

  data.originalLines.forEach((line: string, i: number) => {
    const blockIndex = data.blocks.findIndex((b: BunbookBlock) => b.lineStart === i);
    if (blockIndex !== -1) {
      if (currentGroup.length > 0) {
        const div = document.createElement("div");
        div.className = "notebook-markdown";
        div.innerHTML = md.render(currentGroup.join("\n"));
        notebookElement.appendChild(div);
        currentGroup = [];
      }
      const block = data.blocks[blockIndex];
      const resGroup = document.createElement("div");
      resGroup.className = "notebook-block collapsed";

      const header = document.createElement("div");
      header.className = "block-header";
      header.innerHTML = `
        <span class="block-title">Code Block ${blockIndex}</span>
        <span class="block-toggle-icon">▼</span>
      `;
      header.onclick = () => {
          resGroup.classList.toggle("collapsed");
          resGroup.classList.toggle("expanded");
          const icon = header.querySelector(".block-toggle-icon");
          if (icon) icon.textContent = resGroup.classList.contains("collapsed") ? "▼" : "▲";
      };
      resGroup.appendChild(header);

      const editorContainer = document.createElement("div");
      editorContainer.className = "notebook-code-editor";
      resGroup.appendChild(editorContainer);

      const view = new EditorView({
        state: EditorState.create({
          doc: block.code.trim(),
          extensions: [
            basicSetup,
            javascript({ typescript: true }),
            oneDark,
            autocompletion({ override: [notebookCompletions] }),
            lintGutter(),
            linter(view => notebookLinter(view)),
            notebookTooltips(),
            keymap.of([
              indentWithTab,
              { key: "Shift-Enter", run: () => { 
                  if (currentFile) saveChanges(blockIndex, view.state.doc.toString()); 
                  return true; 
              } }
            ]),
            EditorView.updateListener.of((update) => {
              if (update.docChanged) onCodeChange(blockIndex, view.state.doc.toString());
            })
          ]
        }),
        parent: editorContainer
      });
      editors.set(blockIndex, view);
      
      const blockOutputs = data.outputs[blockIndex] || [];
      if (blockOutputs.length > 0) {
        const outDiv = document.createElement("div");
        outDiv.className = "notebook-output";
        outDiv.innerHTML = formatOutput(blockOutputs);
        resGroup.appendChild(outDiv);
      }
      notebookElement.appendChild(resGroup);
    } else {
      const isInsideAnyBlock = data.blocks.some((b: BunbookBlock) => i >= b.lineStart && i <= b.lineEnd);
      if (!isInsideAnyBlock) {
          currentGroup.push(line);
      }
    }
  });

  if (currentGroup.length > 0) {
    const lastDiv = document.createElement("div");
    lastDiv.className = "notebook-markdown";
    lastDiv.innerHTML = md.render(currentGroup.join("\n"));
    notebookElement.appendChild(lastDiv);
  }
}

let debounceTimer: Timer | null = null;
function onCodeChange(blockIndex: number, newCode: string) {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => { saveChanges(blockIndex, newCode); }, 500);
}

async function saveChanges(blockIndex: number, newCode: string) {
    if (!currentFile) return;
    try {
        const response = await fetch("/api/save-block", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ file: currentFile, blockIndex, code: newCode })
        });
        const data = await response.json() as BunbookResult;
        updateUIWithResults(data);
    } catch {
        console.error("Failed to save changes");
    }
}

function updateUIWithResults(data: BunbookResult) {
    if (statusElement) statusElement.innerText = "Connected - Updated: " + data.timestamp;
    
    data.blocks.forEach((_block: BunbookBlock, index: number) => {
        const blockDivs = document.querySelectorAll('.notebook-block');
        const blockDiv = blockDivs[index];
        if (blockDiv) {
            let outDiv = blockDiv.querySelector('.notebook-output');
            const blockOutputs = data.outputs[index] || [];
            if (blockOutputs.length > 0) {
                if (!outDiv) {
                    outDiv = document.createElement('div');
                    outDiv.className = 'notebook-output';
                    blockDiv.appendChild(outDiv);
                }
                outDiv.innerHTML = formatOutput(blockOutputs);
            } else if (outDiv) {
                outDiv.remove();
            }
        }
    });
    // Trigger a global re-lint once UI is updated
    const { source } = notebookProject.getUnifiedSource();
    tsWorker.postMessage({ type: "update", source });
}

function formatOutput(lines: string[]): string {
  if (lines.length === 0) return "";
  const isTable = lines.some(line => line.includes('┌') || line.includes('│'));
  
  if (isTable) {
    const table = document.createElement('table');
    table.className = 'output-table';
    const nonTableLines: string[] = [];
    
    lines.forEach(line => {
      if (line.includes('│')) {
        const row = document.createElement('tr');
        const cells = line.split('│').map(c => c.trim());
        if (cells[0] === '') cells.shift();
        if (cells[cells.length - 1] === '') cells.pop();

        if (cells.length > 0) {
          cells.forEach(cell => {
            const isHeader = line.includes('index') || line.includes('┌') || line.includes('┬');
            const td = document.createElement(isHeader ? 'th' : 'td');
            td.innerText = cell;
            row.appendChild(td);
          });
          table.appendChild(row);
        }
      } else if (!line.includes('─') && !line.includes('┌') && !line.includes('└') && line.trim() !== '') {
        nonTableLines.push(line);
      }
    });
    
    const container = document.createElement('div');
    container.appendChild(table);
    if (nonTableLines.length > 0) {
      const textDiv = document.createElement('pre');
      textDiv.innerText = nonTableLines.join('\n');
      container.appendChild(textDiv);
    }
    return container.innerHTML;
  }
  return lines.join("\n");
}

const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
const socket = new WebSocket(`${protocol}//${window.location.host}/ws`);
socket.onopen = () => { if (statusElement) statusElement.innerText = "Connected"; };
socket.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === "reload" && data.file === currentFile) updateOutputsOnly();
};

async function updateOutputsOnly() {
    if (!currentFile) return;
    const response = await fetch(`/api/notebook?file=${encodeURIComponent(currentFile)}`);
    const data = await response.json() as BunbookResult;
    updateUIWithResults(data);
}

loadFiles();
if (!currentFile) fetchNotebook();
