const API_BASE = "https://compartir-imagenes.onrender.com";

const el = (id) => document.getElementById(id);
const authView = el("authView");
const forcePassView = el("forcePassView");
const appView = el("appView");
const userLabel = el("userLabel");
const logoutBtn = el("logoutBtn");

const authMsg = el("authMsg");
const regMsg = el("regMsg");
const passMsg = el("passMsg");
const status = el("status");

let token = localStorage.getItem("token") || "";
let user = JSON.parse(localStorage.getItem("user") || "null");

// Destinatario seleccionado
let targetUsername = "";

// Para no fugarnos de memoria con blob URLs
let objectUrls = [];
function rememberObjectUrl(url) { objectUrls.push(url); }
function clearObjectUrls() {
  for (const u of objectUrls) { try { URL.revokeObjectURL(u); } catch {} }
  objectUrls = [];
}

function setStatus(msg) { status.textContent = msg || ""; }
function show(id) { el(id).classList.remove("hidden"); }
function hide(id) { el(id).classList.add("hidden"); }

function setSession(t, u) {
  token = t;
  user = u;
  localStorage.setItem("token", token);
  localStorage.setItem("user", JSON.stringify(user));
  userLabel.textContent = user ? `@${user.username}` : "";
  logoutBtn.classList.toggle("hidden", !token);
}

function clearSession() {
  token = "";
  user = null;
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  userLabel.textContent = "";
  logoutBtn.classList.add("hidden");
}

async function api(path, opts = {}) {
  const headers = opts.headers ? { ...opts.headers } : {};
  if (!(opts.body instanceof FormData)) headers["Content-Type"] = headers["Content-Type"] || "application/json";
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...opts, headers });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data;
}

// --------------------
// Miniaturas protegidas (fetch + blob)
// --------------------
async function setImgWithAuth(imgEl, fileUrl) {
  // cache busting simple para evitar cosas raras
  const u = new URL(fileUrl);
  u.searchParams.set("_", String(Date.now()));

  const res = await fetch(u.toString(), {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store"
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const blob = await res.blob();
  const objUrl = URL.createObjectURL(blob);

  // libera la anterior si existía
  if (imgEl.dataset.objUrl) { try { URL.revokeObjectURL(imgEl.dataset.objUrl); } catch {} }

  imgEl.src = objUrl;
  imgEl.dataset.objUrl = objUrl;
  rememberObjectUrl(objUrl);
}

// --------------------
// UI helpers
// --------------------
function initials(name) {
  const s = (name || "").trim();
  if (!s) return "?";
  const parts = s.split(/[\s._-]+/).filter(Boolean);
  const a = parts[0]?.[0] || s[0];
  const b = parts[1]?.[0] || "";
  return (a + b).toUpperCase();
}

function setTarget(u) {
  targetUsername = u || "";
  el("targetLabel").textContent = targetUsername || "—";
  el("targetLabel2").textContent = targetUsername || "—";
  updateSendEnabled();
  document.querySelectorAll(".contact").forEach(node => {
    node.classList.toggle("active", node.dataset.username === targetUsername);
  });
}

function updateSendEnabled() {
  const hasTarget = !!targetUsername;
  const hasFile = !!el("file").files?.[0];
  el("sendBtn").disabled = !(hasTarget && hasFile);
}

function toast(text) {
  setStatus(text);
  setTimeout(() => setStatus(""), 1800);
}

// --------------------
// Views
// --------------------
function showAuth() {
  show("authView"); hide("forcePassView"); hide("appView");
}
function showForcePass() {
  hide("authView"); show("forcePassView"); hide("appView");
}
function showApp() {
  hide("authView"); hide("forcePassView"); show("appView");
  el("profileUser").textContent = user?.username || "";
  loadContacts().catch(() => {});
}

// Tabs
function activateTab(tabId, viewId) {
  ["tabSend","tabSent","tabReceived","tabProfile"].forEach(t => el(t).classList.remove("active"));
  ["viewSend","viewSent","viewReceived","viewProfile"].forEach(v => hide(v));
  el(tabId).classList.add("active");
  show(viewId);

  if (viewId === "viewSend") loadContacts().catch(() => {});
}

// --------------------
// AUTH
// --------------------
el("loginBtn").addEventListener("click", async () => {
  authMsg.textContent = "";
  try {
    const username = el("loginUser").value.trim();
    const password = el("loginPass").value;
    const r = await api("/auth/login", { method: "POST", body: JSON.stringify({ username, password }) });
    setSession(r.token, r.user);
    if (r.user.must_change_password) showForcePass();
    else showApp();
  } catch (e) {
    authMsg.textContent = `❌ ${e.message}`;
  }
});

el("regBtn").addEventListener("click", async () => {
  regMsg.textContent = "";
  try {
    const username = el("regUser").value.trim();
    const r = await api("/auth/register", { method: "POST", body: JSON.stringify({ username }) });
    regMsg.textContent = `✅ Usuario creado. Contraseña temporal: ${r.tempPassword} (cópiala)`;
  } catch (e) {
    regMsg.textContent = `❌ ${e.message}`;
  }
});

el("changePassBtn").addEventListener("click", async () => {
  passMsg.textContent = "";
  try {
    const newPassword = el("newPass").value;
    await api("/auth/change-password", { method: "POST", body: JSON.stringify({ newPassword }) });
    user.must_change_password = false;
    localStorage.setItem("user", JSON.stringify(user));
    showApp();
    toast("✅ Contraseña cambiada");
  } catch (e) {
    passMsg.textContent = `❌ ${e.message}`;
  }
});

logoutBtn.addEventListener("click", () => {
  clearObjectUrls();
  clearSession();
  showAuth();
});

// --------------------
// CONTACTS
// --------------------
el("refreshContactsBtn").addEventListener("click", () => loadContacts());

async function loadContacts() {
  const box = el("contactsList");
  box.innerHTML = `<div style="padding:12px" class="muted">Cargando…</div>`;

  try {
    const cs = await api("/contacts");
    if (!cs.length) {
      box.innerHTML = `<div style="padding:12px" class="muted">Aún no tienes contactos. Usa el buscador.</div>`;
      return;
    }

    box.innerHTML = "";
    for (const c of cs) {
      const node = document.createElement("div");
      node.className = "contact";
      node.dataset.username = c.username;
      node.innerHTML = `
        <div class="avatar">${initials(c.username)}</div>
        <div style="min-width:0">
          <div class="contactName">${c.username}</div>
          <div class="contactMeta">Reciente</div>
        </div>
      `;
      node.addEventListener("click", () => setTarget(c.username));
      box.appendChild(node);
    }

    if (targetUsername) setTarget(targetUsername);
  } catch (e) {
    box.innerHTML = `<div style="padding:12px" class="muted">Error: ${e.message}</div>`;
  }
}

// --------------------
// SEARCH
// --------------------
el("searchBtn").addEventListener("click", async () => {
  const container = el("searchResults");
  container.innerHTML = "";
  const q = el("searchQ").value.trim();
  if (!q) return;

  try {
    const rs = await api(`/users/search?q=${encodeURIComponent(q)}`);
    if (!rs.length) {
      container.innerHTML = `<div class="muted">Sin resultados.</div>`;
      return;
    }

    for (const u of rs) {
      const node = document.createElement("div");
      node.className = "result";
      node.innerHTML = `
        <div class="row" style="gap:10px;min-width:0">
          <div class="avatar">${initials(u.username)}</div>
          <div style="min-width:0">
            <div style="font-weight:700">${u.username}</div>
            <div class="muted">Usuario</div>
          </div>
        </div>
        <button class="btn secondary">Seleccionar</button>
      `;
      node.querySelector("button").addEventListener("click", () => {
        setTarget(u.username);
        toast(`✅ Destino: ${u.username}`);
      });
      container.appendChild(node);
    }
  } catch (e) {
    container.innerHTML = `<div class="muted">Error: ${e.message}</div>`;
  }
});

// --------------------
// DROPZONE + PREVIEW (local, no auth needed)
// --------------------
const dropzone = el("dropzone");
const fileInput = el("file");
const dzFile = el("dzFile");
const previewWrap = el("previewWrap");
const sendPreview = el("sendPreview");
const clearFileBtn = el("clearFileBtn");

let localPreviewUrl = "";

function setFileLabel(file) {
  dzFile.textContent = file ? `Seleccionado: ${file.name}` : "";
}

function setLocalPreview(file) {
  // limpiar anterior
  if (localPreviewUrl) { try { URL.revokeObjectURL(localPreviewUrl); } catch {} }
  localPreviewUrl = "";

  if (!file) {
    hide("previewWrap");
    sendPreview.removeAttribute("src");
    return;
  }

  localPreviewUrl = URL.createObjectURL(file);
  sendPreview.src = localPreviewUrl;
  show("previewWrap");
}

dropzone.addEventListener("click", () => fileInput.click());
dropzone.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") fileInput.click(); });

dropzone.addEventListener("dragover", (e) => { e.preventDefault(); dropzone.style.borderColor = "#999"; });
dropzone.addEventListener("dragleave", () => { dropzone.style.borderColor = ""; });
dropzone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropzone.style.borderColor = "";
  const f = e.dataTransfer.files?.[0];
  if (f) {
    fileInput.files = e.dataTransfer.files;
    setFileLabel(f);
    setLocalPreview(f);
    updateSendEnabled();
  }
});

fileInput.addEventListener("change", () => {
  const f = fileInput.files?.[0];
  setFileLabel(f);
  setLocalPreview(f);
  updateSendEnabled();
});

clearFileBtn.addEventListener("click", () => {
  fileInput.value = "";
  setFileLabel(null);
  setLocalPreview(null);
  updateSendEnabled();
});

// --------------------
// SEND IMAGE
// --------------------
el("sendBtn").addEventListener("click", async () => {
  el("sendMsg").textContent = "";
  el("shareMsg").textContent = "";

  try {
    const file = fileInput.files?.[0];
    if (!targetUsername) return (el("sendMsg").textContent = "❌ Elige un destinatario.");
    if (!file) return (el("sendMsg").textContent = "❌ Elige una imagen.");

    const fd = new FormData();
    fd.append("toUsername", targetUsername);
    fd.append("image", file);

    setStatus("Enviando…");
    const r = await api("/messages/send", { method: "POST", body: fd });

    setStatus("✅ Enviado");
    el("sendMsg").textContent = `✅ Enviado a ${r.receiver}. Expira: ${new Date(r.expiresAt).toLocaleString()}`;
    if (r.shareLink) el("shareMsg").textContent = `Link corto (opcional): ${r.shareLink}`;

    // Limpia selección
    fileInput.value = "";
    setFileLabel(null);
    setLocalPreview(null);
    updateSendEnabled();

    await loadContacts();
  } catch (e) {
    setStatus(`❌ ${e.message}`);
  }
});

// --------------------
// SENT
// --------------------
el("reloadSentBtn").addEventListener("click", loadSent);

async function loadSent() {
  clearObjectUrls();
  const grid = el("sentGrid");
  grid.innerHTML = `<div class="muted">Cargando…</div>`;

  try {
    const items = await api("/messages/sent");
    if (!items.length) { grid.innerHTML = `<div class="muted">No hay enviadas.</div>`; return; }
    grid.innerHTML = "";

    for (const m of items) {
      const fileUrl = `${API_BASE}${m.fileUrl}`;

      const div = document.createElement("div");
      div.className = "thumb";
      div.innerHTML = `
        <div class="imgFallback">Cargando miniatura…</div>
        <img alt="" style="display:none" />
        <div class="meta">
          <div><strong>Para:</strong> ${m.to_username}</div>
          <div class="small">${m.original_name || ""}</div>
          <div class="small">Expira: ${new Date(m.expires_at).toLocaleString()}</div>
          <div class="actions">
            <button class="btn secondary" data-open>Abrir</button>
            <button class="btn secondary" data-dl>Descargar</button>
          </div>
        </div>
      `;

      const fallback = div.querySelector(".imgFallback");
      const img = div.querySelector("img");

      setImgWithAuth(img, fileUrl)
        .then(() => {
          fallback.remove();
          img.style.display = "block";
        })
        .catch(() => {
          fallback.textContent = "No se pudo cargar miniatura";
        });

      div.querySelector("button[data-open]").addEventListener("click", async () => {
        try {
          const res = await fetch(fileUrl, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          rememberObjectUrl(url);
          window.open(url, "_blank");
        } catch (err) { alert(err.message); }
      });

      div.querySelector("button[data-dl]").addEventListener("click", async () => {
        try { await downloadOne(fileUrl, m.original_name || "foto"); }
        catch (err) { alert(err.message); }
      });

      grid.appendChild(div);
    }
  } catch (e) {
    grid.innerHTML = `<div class="muted">Error: ${e.message}</div>`;
  }
}

// --------------------
// RECEIVED
// --------------------
el("reloadReceivedBtn").addEventListener("click", loadReceived);
el("downloadSelectedBtn").addEventListener("click", downloadSelected);

let selected = new Map();

async function loadReceived() {
  clearObjectUrls();
  selected.clear();

  const area = el("receivedArea");
  area.innerHTML = `<div class="muted">Cargando…</div>`;

  try {
    const grouped = await api("/messages/received");
    const senders = Object.keys(grouped);
    if (!senders.length) { area.innerHTML = `<div class="muted">No hay recibidas.</div>`; return; }
    area.innerHTML = "";

    for (const from of senders) {
      const block = document.createElement("div");
      block.className = "card";
      block.style.boxShadow = "none";
      block.innerHTML = `<h4 style="margin:0 0 10px 0">De: ${from}</h4><div class="grid"></div>`;
      const grid = block.querySelector(".grid");

      for (const item of grouped[from]) {
        const fileUrl = `${API_BASE}${item.fileUrl}`;

        const div = document.createElement("div");
        div.className = "thumb";
        div.innerHTML = `
          <div class="imgFallback">Cargando miniatura…</div>
          <img alt="" style="display:none" />
          <div class="meta">
            <label class="row" style="gap:8px">
              <input type="checkbox" data-url="${fileUrl}" data-name="${item.original_name || "foto"}" />
              <span class="muted">Seleccionar</span>
            </label>
            <div class="small">${item.original_name || ""}</div>
            <div class="small">Expira: ${new Date(item.expires_at).toLocaleString()}</div>
            <div class="actions">
              <button class="btn secondary" data-open>Abrir</button>
              <button class="btn secondary" data-dl>Descargar</button>
            </div>
          </div>
        `;

        const fallback = div.querySelector(".imgFallback");
        const img = div.querySelector("img");

        setImgWithAuth(img, fileUrl)
          .then(() => {
            fallback.remove();
            img.style.display = "block";
          })
          .catch(() => {
            fallback.textContent = "No se pudo cargar miniatura";
          });

        div.querySelector('input[type="checkbox"]').addEventListener("change", (e) => {
          const u = e.target.getAttribute("data-url");
          const n = e.target.getAttribute("data-name");
          if (e.target.checked) selected.set(u, n);
          else selected.delete(u);
        });

        div.querySelector("button[data-open]").addEventListener("click", async () => {
          try {
            const res = await fetch(fileUrl, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            rememberObjectUrl(url);
            window.open(url, "_blank");
          } catch (err) { alert(err.message); }
        });

        div.querySelector("button[data-dl]").addEventListener("click", async () => {
          try { await downloadOne(fileUrl, item.original_name || "foto"); }
          catch (err) { alert(err.message); }
        });

        grid.appendChild(div);
      }

      area.appendChild(block);
    }
  } catch (e) {
    area.innerHTML = `<div class="muted">Error: ${e.message}</div>`;
  }
}

async function downloadOne(fileUrl, filename) {
  const res = await fetch(fileUrl, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const blob = await res.blob();
  const objUrl = URL.createObjectURL(blob);
  rememberObjectUrl(objUrl);

  const a = document.createElement("a");
  a.href = objUrl;
  a.download = filename || "foto";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

async function downloadSelected() {
  if (selected.size === 0) return alert("No has seleccionado nada.");
  setStatus(`Descargando ${selected.size}…`);
  try {
    for (const [u, n] of selected.entries()) await downloadOne(u, n);
    toast("✅ Descargas lanzadas");
  } catch (e) {
    setStatus(`❌ ${e.message}`);
  }
}

// --------------------
// PROFILE
// --------------------
el("profileChangePassBtn").addEventListener("click", async () => {
  el("profileMsg").textContent = "";
  try {
    const newPassword = el("profileNewPass").value;
    await api("/auth/change-password", { method: "POST", body: JSON.stringify({ newPassword }) });
    el("profileMsg").textContent = "✅ Contraseña cambiada";
  } catch (e) {
    el("profileMsg").textContent = `❌ ${e.message}`;
  }
});

// Tabs actions
el("tabSend").addEventListener("click", () => activateTab("tabSend","viewSend"));
el("tabSent").addEventListener("click", () => { activateTab("tabSent","viewSent"); loadSent(); });
el("tabReceived").addEventListener("click", () => { activateTab("tabReceived","viewReceived"); loadReceived(); });
el("tabProfile").addEventListener("click", () => activateTab("tabProfile","viewProfile"));

// Init
(function init() {
  if (token && user) {
    setSession(token, user);
    if (user.must_change_password) showForcePass();
    else showApp();
  } else {
    showAuth();
  }
})();