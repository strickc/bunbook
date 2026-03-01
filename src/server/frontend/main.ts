import { EditorView, basicSetup } from "codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { markdown } from "@codemirror/lang-markdown";
import { oneDark } from "@codemirror/theme-one-dark";
import { EditorState } from "@codemirror/state";
import { keymap, hoverTooltip } from "@codemirror/view";
import { indentWithTab } from "@codemirror/commands";
import { autocompletion, CompletionContext, CompletionResult } from "@codemirror/autocomplete";
import { lintGutter, linter, Diagnostic } from "@codemirror/lint";
import * as MarkdownIt from "markdown-it";
import { type BunbookResult, type BunbookBlock, type NotebookChunk } from "../../core/engine.js";

// @ts-ignore
const md = new MarkdownIt.default();
const notebookElement = document.getElementById("notebook");
const statusElement = document.getElementById("status");
const fileListElement = document.getElementById("file-list");
const sidebarTitle = document.getElementById("current-filename");

let currentFile: string | null = null;
const chunkEditors = new Map<number, EditorView>();
const expandedBlocks = new Set<number>();

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
        Array.from(chunkEditors.keys()).sort((a,b) => a-b).forEach(chunkIndex => {
            const editor = chunkEditors.get(chunkIndex);
            if (!editor) return;
            const chunk = lastNotebookData?.chunks[chunkIndex];
            if (chunk?.type === 'buneval') {
                const code = editor.state.doc.toString();
                source += code + "\n\n";
                offsets.push({ blockIndex: chunkIndex, start: currentOffset, end: currentOffset + code.length });
                currentOffset += code.length + 2;
            }
        });
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
  chunkEditors.forEach((view, index) => {
    const text = view.state.doc.toString();
    const matches = text.matchAll(/(?:const|let|var|function)\s+([a-zA-Z0-9_$]+)/g);
    for (const match of matches) {
      const name = match[1];
      if (!seen.has(name)) {
        options.push({ label: name, type: 'variable', info: `From Chunk ${index}` });
        seen.add(name);
      }
    }
  });
  return { from: word.from, options: options };
}

function notebookLinter(view: EditorView) {
    const { source } = notebookProject.getUnifiedSource();
    let activeIndex = -1;
    chunkEditors.forEach((v, idx) => { if (v === view) activeIndex = idx; });
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
    chunkEditors.forEach((v, idx) => { if (v === view) activeIndex = idx; });
    const blockDiags = pendingDiagnostics.get(activeIndex) || [];
    const found = blockDiags.find(d => pos >= d.from && pos <= d.to);
    if (!found) return null;
    return {
      pos: found.from, end: found.to, above: true,
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
  expandedBlocks.clear(); // Reset expanded state when switching files
  if (sidebarTitle) sidebarTitle.innerText = file;
  document.querySelectorAll('.file-item').forEach(el => {
      if (el instanceof HTMLElement) el.classList.toggle('active', el.innerText === file);
  });
  fetchNotebook(file);
}

let lastNotebookData: BunbookResult | null = null;

async function fetchNotebook(file: string | null = currentFile) {
  if (!file) return;
  try {
    const response = await fetch(`/api/notebook?file=${encodeURIComponent(file)}`);
    const data = await response.json() as BunbookResult;
    lastNotebookData = data;
    renderNotebook(data);
  } catch (err) { console.error("Error fetching notebook:", err); }
}

function renderNotebook(data: BunbookResult) {
  if (!notebookElement) return;
  notebookElement.innerHTML = "";
  chunkEditors.clear();

  data.chunks.forEach((chunk, index) => {
      const chunkWrapper = document.createElement("div");
      chunkWrapper.className = `notebook-chunk ${chunk.type}-chunk`;
      
      if (chunk.type === 'markdown') {
          const previewDiv = document.createElement("div");
          previewDiv.className = "chunk-preview";
          previewDiv.innerHTML = md.render(chunk.content || "*Empty markdown block*");
          
          const editorContainer = document.createElement("div");
          editorContainer.className = "chunk-editor";
          
          chunkWrapper.appendChild(previewDiv);
          chunkWrapper.appendChild(editorContainer);

          const view = new EditorView({
              state: EditorState.create({
                  doc: chunk.content,
                  extensions: [
                      basicSetup, oneDark, markdown(),
                      EditorView.lineWrapping,
                      EditorView.domEventHandlers({
                          blur: () => {
                              chunkWrapper.classList.remove('editing');
                              previewDiv.innerHTML = md.render(view.state.doc.toString() || "*Empty markdown block*");
                              triggerSave();
                          }
                      }),
                      EditorView.updateListener.of((update) => { if (update.docChanged) onContentChange(); })
                  ]
              }),
              parent: editorContainer
          });
          chunkEditors.set(index, view);

          previewDiv.onclick = () => {
              chunkWrapper.classList.add('editing');
              view.focus();
          };
      } else {
          const header = document.createElement("div");
          header.className = "block-header";
          header.innerHTML = `<span class="block-title">Code Block ${chunk.blockIndex}</span><span class="block-toggle-icon">▼</span>`;
          
          const editorContainer = document.createElement("div");
          editorContainer.className = "chunk-editor";
          
          chunkWrapper.appendChild(header);
          chunkWrapper.appendChild(editorContainer);
          
          // Use the tracking set to determine initial state
          const isExpanded = expandedBlocks.has(chunk.blockIndex!);
          chunkWrapper.classList.toggle('collapsed', !isExpanded);
          chunkWrapper.classList.toggle('expanded', isExpanded);
          const initialIcon = chunkWrapper.classList.contains("collapsed") ? "▼" : "▲";
          header.querySelector(".block-toggle-icon")!.textContent = initialIcon;
          
          header.onclick = () => {
              const nowCollapsed = chunkWrapper.classList.toggle('collapsed');
              chunkWrapper.classList.toggle('expanded', !nowCollapsed);
              
              if (nowCollapsed) expandedBlocks.delete(chunk.blockIndex!);
              else expandedBlocks.add(chunk.blockIndex!);

              const icon = header.querySelector(".block-toggle-icon");
              if (icon) icon.textContent = nowCollapsed ? "▼" : "▲";
          };

          const view = new EditorView({
              state: EditorState.create({
                  doc: chunk.content,
                  extensions: [
                      basicSetup, oneDark, javascript({ typescript: true }),
                      EditorView.lineWrapping,
                      autocompletion({ override: [notebookCompletions] }),
                      lintGutter(), linter(view => notebookLinter(view)),
                      notebookTooltips(),
                      keymap.of([
                          indentWithTab,
                          { key: "Shift-Enter", run: () => { triggerSave(); return true; } }
                      ]),
                      EditorView.updateListener.of((update) => { if (update.docChanged) onContentChange(); })
                  ]
              }),
              parent: editorContainer
          });
          chunkEditors.set(index, view);

          const outDiv = document.createElement("div");
          outDiv.className = "notebook-output";
          const outputs = data.outputs[chunk.blockIndex!] || [];
          outDiv.innerHTML = formatOutput(outputs);
          chunkWrapper.appendChild(outDiv);
      }

      notebookElement.appendChild(chunkWrapper);
  });
}

let saveTimer: Timer | null = null;
function onContentChange() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { triggerSave(); }, 800);
}

async function triggerSave() {
    if (!currentFile || !lastNotebookData) return;
    const blocks = lastNotebookData.chunks.map((chunk, index) => {
        const editor = chunkEditors.get(index);
        return { type: chunk.type, content: editor ? editor.state.doc.toString() : chunk.content };
    });
    try {
        const response = await fetch("/api/save-notebook", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ file: currentFile, chunks: blocks })
        });
        const data = await response.json() as BunbookResult;
        lastNotebookData = data;
        updateOutputsOnly(data);
    } catch (err) { console.error("Save failed", err); }
}

function updateOutputsOnly(data: BunbookResult) {
    if (statusElement) statusElement.innerText = "Connected - Updated: " + data.timestamp;
    data.chunks.forEach((chunk, index) => {
        if (chunk.type === 'buneval') {
            const chunkWrappers = document.querySelectorAll('.notebook-chunk');
            const wrapper = chunkWrappers[index];
            if (wrapper) {
                let outDiv = wrapper.querySelector('.notebook-output');
                const outputs = data.outputs[chunk.blockIndex!] || [];
                if (outputs.length > 0) {
                    if (!outDiv) {
                        outDiv = document.createElement('div');
                        outDiv.className = 'notebook-output';
                        wrapper.appendChild(outDiv);
                    }
                    outDiv.innerHTML = formatOutput(outputs);
                } else if (outDiv) {
                    outDiv.remove();
                }
            }
        }
    });
}

function formatOutput(lines: string[]): string {
  if (lines.length === 0) return "";
  const isTable = lines.some(line => line.includes('┌') || line.includes('│'));
  if (isTable) {
    const tableLines: string[] = [];
    const nonTableLines: string[] = [];
    lines.forEach(line => {
      if (line.includes('│')) {
        const cells = line.split('│').map(c => c.trim());
        if (cells[0] === '') cells.shift();
        if (cells[cells.length - 1] === '') cells.pop();
        if (cells.length > 0) {
            tableLines.push(`| ${cells.join(' | ')} |`);
            if (tableLines.length === 1) tableLines.push(`| ${cells.map(() => '---').join(' | ')} |`);
        }
      } else if (!line.includes('─') && !line.includes('┌') && !line.includes('└') && line.trim() !== '') {
        nonTableLines.push(line);
      }
    });
    return md.render(tableLines.join('\n')) + nonTableLines.map(l => md.render(l)).join('\n');
  }
  return lines.map(line => md.render(line)).join('\n');
}

const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
const socket = new WebSocket(`${protocol}//${window.location.host}/ws`);
socket.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === "reload" && data.file === currentFile) fetchNotebook();
};

loadFiles();
if (!currentFile) fetchNotebook();
