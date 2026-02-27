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

// Views
function showAuth() {
  show("authView"); hide("forcePassView"); hide("appView");
}
function showForcePass() {
  hide("authView"); show("forcePassView"); hide("appView");
}
function showApp() {
  hide("authView"); hide("forcePassView"); show("appView");
  el("profileUser").textContent = user?.username || "";
}

// Tabs
function activateTab(tabId, viewId) {
  ["tabSend","tabSent","tabReceived","tabProfile"].forEach(t => el(t).classList.remove("active"));
  ["viewSend","viewSent","viewReceived","viewProfile"].forEach(v => hide(v));
  el(tabId).classList.add("active");
  show(viewId);
}

// Auth actions
el("loginBtn").addEventListener("click", async () => {
  authMsg.textContent = "";
  try {
    const username = el("loginUser").value.trim();
    const password = el("loginPass").value;
    const r = await api("/auth/login", { method: "POST", body: JSON.stringify({ username, password }) });
    setSession(r.token, r.user);
    if (r.user.must_change_password) showForcePass();
    else { showApp(); setStatus(""); }
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
    // refrescar user flag local
    user.must_change_password = false;
    localStorage.setItem("user", JSON.stringify(user));
    showApp();
    setStatus("✅ Contraseña cambiada");
  } catch (e) {
    passMsg.textContent = `❌ ${e.message}`;
  }
});

logoutBtn.addEventListener("click", () => {
  clearSession();
  showAuth();
});

// Send: contacts & search
const contactSelect = el("contactSelect");
const searchSelect = el("searchSelect");

el("loadContactsBtn").addEventListener("click", async () => {
  setStatus("Cargando contactos…");
  try {
    const cs = await api("/contacts");
    contactSelect.innerHTML = `<option value="">(elige un contacto)</option>` +
      cs.map(c => `<option value="${c.username}">${c.username}</option>`).join("");
    setStatus(`✅ ${cs.length} contactos`);
  } catch (e) {
    setStatus(`❌ ${e.message}`);
  }
});

el("searchBtn").addEventListener("click", async () => {
  setStatus("Buscando…");
  try {
    const q = el("searchQ").value.trim();
    const rs = await api(`/users/search?q=${encodeURIComponent(q)}`);
    searchSelect.innerHTML = `<option value="">(resultados)</option>` +
      rs.map(u => `<option value="${u.username}">${u.username}</option>`).join("");
    setStatus(`✅ ${rs.length} resultados`);
  } catch (e) {
    setStatus(`❌ ${e.message}`);
  }
});

el("useSearchBtn").addEventListener("click", () => {
  const u = searchSelect.value;
  if (u) contactSelect.value = u;
});

// Send image
el("sendBtn").addEventListener("click", async () => {
  el("sendMsg").textContent = "";
  el("shareMsg").textContent = "";
  try {
    const toUsername = contactSelect.value;
    if (!toUsername) return el("sendMsg").textContent = "❌ Elige un contacto primero.";
    const file = el("file").files?.[0];
    if (!file) return el("sendMsg").textContent = "❌ Elige una imagen.";

    const fd = new FormData();
    fd.append("toUsername", toUsername);
    fd.append("image", file);

    setStatus("Enviando…");
    const r = await api("/messages/send", { method: "POST", body: fd, headers: {} });
    setStatus("✅ Enviado");
    el("sendMsg").textContent = `✅ Enviado a ${r.receiver}. Expira: ${new Date(r.expiresAt).toLocaleString()}`;
    if (r.shareLink) el("shareMsg").textContent = `Link corto (opcional): ${r.shareLink}`;
    el("file").value = "";
  } catch (e) {
    setStatus(`❌ ${e.message}`);
  }
});

// Sent
el("reloadSentBtn").addEventListener("click", loadSent);
async function loadSent() {
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
        <img src="${fileUrl}" alt="" />
        <div class="meta">
          <div><strong>Para:</strong> ${m.to_username}</div>
          <div class="muted">${m.original_name || ""}</div>
          <div class="muted">Expira: ${new Date(m.expires_at).toLocaleString()}</div>
          <a href="${fileUrl}" target="_blank" rel="noopener">Abrir (requiere token)</a>
        </div>
      `;
      // Abrir con token: hacemos fetch y abrimos blob
      div.querySelector("a").addEventListener("click", async (e) => {
        e.preventDefault();
        try {
          const res = await fetch(fileUrl, { headers: { Authorization: `Bearer ${token}` }});
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          window.open(url, "_blank");
          setTimeout(() => URL.revokeObjectURL(url), 60_000);
        } catch (err) {
          alert("No se pudo abrir: " + err.message);
        }
      });
      grid.appendChild(div);
    }
  } catch (e) {
    grid.innerHTML = `<div class="muted">Error: ${e.message}</div>`;
  }
}

// Received
el("reloadReceivedBtn").addEventListener("click", loadReceived);
el("downloadSelectedBtn").addEventListener("click", downloadSelected);

let selected = new Map(); // key: fileUrl, value: name
async function loadReceived() {
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
      block.innerHTML = `<h4 class="sectionTitle">De: ${from}</h4><div class="grid"></div>`;
      const grid = block.querySelector(".grid");

      for (const item of grouped[from]) {
        const fileUrl = `${API_BASE}${item.fileUrl}`;
        const div = document.createElement("div");
        div.className = "thumb";
        div.innerHTML = `
          <img src="${fileUrl}" alt="" />
          <div class="meta">
            <div class="row" style="justify-content:space-between">
              <label class="row" style="gap:6px">
                <input type="checkbox" data-url="${fileUrl}" data-name="${item.original_name || "foto"}" />
                <span>Seleccionar</span>
              </label>
            </div>
            <div class="muted">${item.original_name || ""}</div>
            <div class="muted">Expira: ${new Date(item.expires_at).toLocaleString()}</div>
            <button class="secondary" data-open="${fileUrl}">Abrir</button>
            <button class="secondary" data-dl="${fileUrl}" data-name="${item.original_name || "foto"}">Descargar</button>
          </div>
        `;

        // check
        div.querySelector('input[type="checkbox"]').addEventListener("change", (e) => {
          const u = e.target.getAttribute("data-url");
          const n = e.target.getAttribute("data-name");
          if (e.target.checked) selected.set(u, n);
          else selected.delete(u);
        });

        // open
        div.querySelector("button[data-open]").addEventListener("click", async () => {
          try {
            const res = await fetch(fileUrl, { headers: { Authorization: `Bearer ${token}` }});
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            window.open(url, "_blank");
            setTimeout(() => URL.revokeObjectURL(url), 60_000);
          } catch (err) { alert(err.message); }
        });

        // download single
        div.querySelector("button[data-dl]").addEventListener("click", async (e) => {
          const u = e.currentTarget.getAttribute("data-dl");
          const n = e.currentTarget.getAttribute("data-name");
          await downloadOne(u, n);
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
  const res = await fetch(fileUrl, { headers: { Authorization: `Bearer ${token}` }});
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const blob = await res.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename || "foto";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
}

async function downloadSelected() {
  if (selected.size === 0) return alert("No has seleccionado nada.");
  setStatus(`Descargando ${selected.size}…`);
  try {
    for (const [u, n] of selected.entries()) {
      await downloadOne(u, n);
    }
    setStatus("✅ Descarga lanzada");
  } catch (e) {
    setStatus(`❌ ${e.message}`);
  }
}

// Profile
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