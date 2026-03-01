const md = window.markdownit();
const notebookElement = document.getElementById("notebook");
const statusElement = document.getElementById("status");

async function fetchNotebook() {
  try {
    const response = await fetch("/api/notebook");
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
        // Use custom formatter to handle console.table etc
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

/**
 * Detects if a block of text looks like a console.table output and renders it as an HTML table.
 */
function formatOutput(lines) {
  if (lines.length === 0) return "";
  
  // Basic detection for console.table output which usually has ┌───────┬──────────┐ structure
  const isTable = lines.some(line => line.includes('┌') || line.includes('├') || line.includes('│'));
  
  if (isTable) {
    // Highly simplified table parser for Bun's console.table output
    // We'll strip the box-drawing characters and clean up the cells.
    const table = document.createElement('table');
    table.className = 'output-table';
    
    lines.forEach(line => {
      // Skip the decorative borders but keep the data rows
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
    
    if (table.children.length > 0) {
        const container = document.createElement('div');
        container.appendChild(table);
        return container.innerHTML;
    }
  }

  return lines.join("\n");
}

// Set up WebSocket
const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
const socket = new WebSocket(`${protocol}//${window.location.host}/ws`);

socket.onopen = () => {
    statusElement.innerText = "Connected";
    statusElement.style.color = "green";
};

socket.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === "reload") {
        fetchNotebook();
    }
};

socket.onclose = () => {
    statusElement.innerText = "Disconnected";
    statusElement.style.color = "red";
};

// Initial Fetch
fetchNotebook();
