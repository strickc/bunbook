import { EditorView, basicSetup } from "codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { oneDark } from "@codemirror/theme-one-dark";
import { EditorState } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import { indentWithTab } from "@codemirror/commands";
import MarkdownIt from "markdown-it";

const md = new MarkdownIt();
const notebookElement = document.getElementById("notebook");
const statusElement = document.getElementById("status");
const fileListElement = document.getElementById("file-list");
const sidebarTitle = document.getElementById("current-filename");

let currentFile = null;
const editors = new Map(); // blockIndex -> EditorView

async function loadFiles() {
  const response = await fetch("/api/files");
  const data = await response.json();
  
  fileListElement.innerHTML = "";
  data.files.forEach(file => {
    const div = document.createElement("div");
    div.className = `file-item ${data.current === file ? 'active' : ''}`;
    div.innerText = file;
    div.addEventListener("click", () => selectFile(file));
    fileListElement.appendChild(div);
  });
  
  if (data.current && !currentFile) {
    selectFile(data.current);
  }
}

async function selectFile(file) {
  currentFile = file;
  sidebarTitle.innerText = file;
  
  document.querySelectorAll('.file-item').forEach(el => {
    el.classList.toggle('active', el.innerText === file);
  });
  
  fetchNotebook(file);
}

async function fetchNotebook(file = currentFile) {
  if (!file) return;
  try {
    const response = await fetch(`/api/notebook?file=${encodeURIComponent(file)}`);
    const data = await response.json();
    renderNotebook(data);
  } catch (err) {
    console.error("Error fetching notebook:", err);
  }
}

function renderNotebook(data) {
  notebookElement.innerHTML = "";
  editors.clear();
  let currentGroup = [];

  for (let i = 0; i < data.originalLines.length; i++) {
    const blockIndex = data.blocks.findIndex(b => b.lineStart === i);
    
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
      resGroup.className = "notebook-block";

      const editorContainer = document.createElement("div");
      editorContainer.className = "notebook-code-editor";
      resGroup.appendChild(editorContainer);

      const controls = document.createElement("div");
      controls.className = "cell-controls";
      controls.innerHTML = `
        <span class="save-status"></span>
        <button class="run-btn" title="Run (Shift+Enter)"><i class="lucide-play"></i> Run</button>
      `;
      resGroup.appendChild(controls);

      // Initialize CodeMirror
      const view = new EditorView({
        state: EditorState.create({
          doc: block.code.trim(),
          extensions: [
            basicSetup,
            javascript({ typescript: true }),
            oneDark,
            keymap.of([
              indentWithTab,
              { key: "Shift-Enter", run: () => { saveChanges(blockIndex, view.state.doc.toString()); return true; } }
            ]),
            EditorView.updateListener.of((update) => {
              if (update.docChanged) {
                onCodeChange(blockIndex, view.state.doc.toString());
              }
            })
          ]
        }),
        parent: editorContainer
      });
      
      controls.querySelector(".run-btn").addEventListener("click", () => {
        saveChanges(blockIndex, view.state.doc.toString());
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
      i = block.lineEnd;
    } else {
      currentGroup.push(data.originalLines[i]);
    }
  }

  if (currentGroup.length > 0) {
    const lastDiv = document.createElement("div");
    lastDiv.className = "notebook-markdown";
    lastDiv.innerHTML = md.render(currentGroup.join("\n"));
    notebookElement.appendChild(lastDiv);
  }
}

let debounceTimer;
function onCodeChange(blockIndex, newCode) {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
        saveChanges(blockIndex, newCode);
    }, 500);
}

async function saveChanges(blockIndex, newCode) {
    if (!currentFile) return;
    const blockDivs = document.querySelectorAll('.notebook-block');
    const statusSpan = blockDivs[blockIndex]?.querySelector('.save-status');
    if (statusSpan) statusSpan.innerText = "Saving...";

    try {
        await fetch("/api/save-block", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                file: currentFile,
                blockIndex,
                code: newCode
            })
        });
        if (statusSpan) {
            statusSpan.innerText = "Saved";
            setTimeout(() => { if (statusSpan.innerText === "Saved") statusSpan.innerText = ""; }, 2000);
        }
    } catch (err) {
        console.error("Failed to save changes:", err);
        if (statusSpan) statusSpan.innerText = "Error!";
    }
}

function formatOutput(lines) {
  if (lines.length === 0) return "";
  const isTable = lines.some(line => line.includes('┌') || line.includes('│'));
  
  if (isTable) {
    const table = document.createElement('table');
    table.className = 'output-table';
    lines.forEach(line => {
      if (line.includes('─') && !line.includes('│')) return;
      const row = document.createElement('tr');
      const cells = line.split('│').filter(c => c.trim() !== '' || line.indexOf('│') !== line.lastIndexOf('│'));
      if (cells.length > 0) {
        cells.forEach(cell => {
          const td = document.createElement(line.includes('index') ? 'th' : 'td');
          td.innerText = cell.trim();
          row.appendChild(td);
        });
        table.appendChild(row);
      }
    });
    const container = document.createElement('div');
    container.appendChild(table);
    return container.innerHTML;
  }
  return lines.join("\n");
}

const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
const socket = new WebSocket(`${protocol}//${window.location.host}/ws`);

socket.onopen = () => {
    statusElement.innerText = "Connected";
    statusElement.className = "status-indicator connected";
};

socket.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === "reload" && data.file === currentFile) {
        // We only want to fetch and update outputs, 
        // not re-render the whole thing which would reset the editors.
        updateOutputsOnly();
    }
};

async function updateOutputsOnly() {
    if (!currentFile) return;
    const response = await fetch(`/api/notebook?file=${encodeURIComponent(currentFile)}`);
    const data = await response.json();
    
    // Update outputs for each block div
    data.blocks.forEach((block, index) => {
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
}

socket.onclose = () => {
    statusElement.innerText = "Disconnected";
    statusElement.className = "status-indicator disconnected";
};

loadFiles();
if (!currentFile) {
    fetchNotebook();
}
