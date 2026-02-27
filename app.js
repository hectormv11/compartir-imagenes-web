// ⚠️ PON AQUÍ TU URL DEL BACKEND (la que está Live)
const API_BASE = "https://compartir-imagenes.onrender.com";

const fileEl = document.getElementById("file");
const uploadBtn = document.getElementById("uploadBtn");
const refreshBtn = document.getElementById("refreshBtn");
const statusEl = document.getElementById("status");
const galleryEl = document.getElementById("gallery");
const apiLabel = document.getElementById("apiLabel");

apiLabel.textContent = `API: ${API_BASE}`;

function setStatus(msg) {
  statusEl.textContent = msg || "";
}

function escapeHtml(s) {
  return (s || "").replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
}

async function loadList() {
  galleryEl.innerHTML = `<div class="muted">Cargando…</div>`;
  try {
    const res = await fetch(`${API_BASE}/list`);
    const files = await res.json();

    if (!Array.isArray(files) || files.length === 0) {
      galleryEl.innerHTML = `<div class="muted">Aún no hay archivos.</div>`;
      return;
    }

    galleryEl.innerHTML = "";
    for (const id of files) {
      const fileUrl = `${API_BASE}/file/${encodeURIComponent(id)}`;
      const div = document.createElement("div");
      div.className = "thumb";
      div.innerHTML = `
        <img src="${fileUrl}" alt="" loading="lazy" />
        <div class="meta">
          <div><strong>${escapeHtml(id).slice(0, 28)}</strong></div>
          <div class="row">
            <a href="${fileUrl}" target="_blank" rel="noopener">Abrir</a>
            <a href="${fileUrl}" download>Descargar original</a>
            <button class="secondary" data-copy="${fileUrl}">Copiar link</button>
          </div>
        </div>
      `;
      div.querySelector("button[data-copy]").addEventListener("click", async (e) => {
        const link = e.currentTarget.getAttribute("data-copy");
        await navigator.clipboard.writeText(link);
        setStatus("✅ Link copiado");
        setTimeout(() => setStatus(""), 1500);
      });

      galleryEl.appendChild(div);
    }
  } catch (e) {
    galleryEl.innerHTML = `<div class="muted">Error cargando lista.</div>`;
  }
}

uploadBtn.addEventListener("click", async () => {
  const file = fileEl.files?.[0];
  if (!file) return alert("Elige una imagen primero.");

  setStatus("Subiendo…");

  const fd = new FormData();
  fd.append("image", file);

  try {
    const res = await fetch(`${API_BASE}/upload`, { method: "POST", body: fd });
    const data = await res.json();

    if (!res.ok) {
      setStatus("");
      return alert(data?.error || "Error subiendo");
    }

    setStatus(`✅ Subida OK: ${data.originalName} (${data.size} bytes)`);
    fileEl.value = "";
    await loadList();
  } catch (e) {
    setStatus("");
    alert("Error de red subiendo.");
  }
});

refreshBtn.addEventListener("click", loadList);

// Init
loadList();