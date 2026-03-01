const md = window.markdownit();
const notebookElement = document.getElementById("notebook");
const statusElement = document.getElementById("status");
const fileListElement = document.getElementById("file-list");
const sidebarTitle = document.getElementById("current-filename");

let currentFile = null;

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
  
  // Highlight active file in sidebar
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

      const codeDiv = document.createElement("div");
      codeDiv.className = "notebook-code";
      codeDiv.innerHTML = `<pre><code>${block.code.trim()}</code></pre>`;
      resGroup.appendChild(codeDiv);

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

// Set up WebSocket
const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
const socket = new WebSocket(`${protocol}//${window.location.host}/ws`);

socket.onopen = () => {
    statusElement.innerText = "Connected";
    statusElement.className = "status-indicator connected";
};

socket.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === "reload" && data.file === currentFile) {
        fetchNotebook(currentFile);
    }
};

socket.onclose = () => {
    statusElement.innerText = "Disconnected";
    statusElement.className = "status-indicator disconnected";
};

// Initial Fetch
loadFiles();
if (!currentFile) {
    fetchNotebook();
}
