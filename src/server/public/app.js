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
        outDiv.innerText = blockOutputs.join("\n");
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
