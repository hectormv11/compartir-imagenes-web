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

// Para evitar fugas de memoria con URLs blob
let objectUrls = [];
function rememberObjectUrl(url) {
  objectUrls.push(url);
}
function clearObjectUrls() {
  for (const u of objectUrls) {
    try { URL.revokeObjectURL(u); } catch {}
  }
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

  // Si no es FormData, enviamos JSON
  if (!(opts.body instanceof FormData)) {
    headers["Content-Type"] = headers["Content-Type"] || "application/json";
  }

  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...opts, headers });

  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }

  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data;
}

/**
 * Carga una imagen protegida por Authorization y la pinta como blob (para miniaturas).
 */
async function setImgWithAuth(imgEl, fileUrl) {
  // Si ya tenía blob anterior, libéralo
  if (imgEl.dataset.objUrl) {
    try { URL.revokeObjectURL(imgEl.dataset.objUrl); } catch {}
  }

  const res = await fetch(fileUrl, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const blob = await res.blob();
  const objUrl = URL.createObjectURL(blob);

  imgEl.src = objUrl;
  imgEl.dataset.objUrl = objUrl;
  rememberObjectUrl(objUrl);
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

// --------------------
// AUTH actions
// --------------------
el("loginBtn").addEventListener("click", async () => {
  authMsg.textContent = "";
  try {
    const username = el("loginUser").value.trim();
    const password = el("loginPass").value;

    const r = await api("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password })
    });

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

    const r = await api("/auth/register", {
      method: "POST",
      body: JSON.stringify({ username })
    });

    regMsg.textContent = `✅ Usuario creado. Contraseña temporal: ${r.tempPassword} (cópiala)`;
  } catch (e) {
    regMsg.textContent = `❌ ${e.message}`;
  }
});

el("changePassBtn").addEventListener("click", async () => {
  passMsg.textContent = "";
  try {
    const newPassword = el("newPass").value;

    await api("/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ newPassword })
    });

    user.must_change_password = false;
    localStorage.setItem("user", JSON.stringify(user));
    showApp();
    setStatus("✅ Contraseña cambiada");
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
// SEND: contacts & search
// --------------------
const contactSelect = el("contactSelect");
const searchSelect = el("searchSelect");

el("loadContactsBtn").addEventListener("click", async () => {
  setStatus("Cargando contactos…");
  try {
    const cs = await api("/contacts");
    contactSelect.innerHTML =
      `<option value="">(elige un contacto)</option>` +
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

    searchSelect.innerHTML =
      `<option value="">(resultados)</option>` +
      rs.map(u => `<option value="${u.username}">${u.username}</option>`).join("");

    setStatus(`✅ ${rs.length} resultados`);
  } catch (e) {
    setStatus(`❌ ${e.message}`);
  }
});

// ✅ FIX: usar seleccionado desde buscador aunque no exista en contactos
el("useSearchBtn").addEventListener("click", () => {
  const u = searchSelect.value;
  if (!u) return;

  const exists = Array.from(contactSelect.options).some(opt => opt.value === u);
  if (!exists) {
    const opt = document.createElement("option");
    opt.value = u;
    opt.textContent = u;
    contactSelect.appendChild(opt);
  }

  contactSelect.value = u;
  setStatus(`✅ Contacto seleccionado: ${u}`);
});

// Send image
el("sendBtn").addEventListener("click", async () => {
  el("sendMsg").textContent = "";
  el("shareMsg").textContent = "";

  try {
    const toUsername = contactSelect.value;
    if (!toUsername) {
      el("sendMsg").textContent = "❌ Elige un contacto primero.";
      return;
    }

    const file = el("file").files?.[0];
    if (!file) {
      el("sendMsg").textContent = "❌ Elige una imagen.";
      return;
    }

    const fd = new FormData();
    fd.append("toUsername", toUsername);
    fd.append("image", file);

    setStatus("Enviando…");
    const r = await api("/messages/send", { method: "POST", body: fd });

    setStatus("✅ Enviado");
    el("sendMsg").textContent = `✅ Enviado a ${r.receiver}. Expira: ${new Date(r.expiresAt).toLocaleString()}`;
    if (r.shareLink) el("shareMsg").textContent = `Link corto (opcional): ${r.shareLink}`;

    el("file").value = "";
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

    if (!items.length) {
      grid.innerHTML = `<div class="muted">No hay enviadas.</div>`;
      return;
    }

    grid.innerHTML = "";

    for (const m of items) {
      const fileUrl = `${API_BASE}${m.fileUrl}`;
      const div = document.createElement("div");
      div.className = "thumb";

      // OJO: img sin src, lo rellenamos con fetch+token
      div.innerHTML = `
        <img alt="" />
        <div class="meta">
          <div><strong>Para:</strong> ${m.to_username}</div>
          <div class="muted">${m.original_name || ""}</div>
          <div class="muted">Expira: ${new Date(m.expires_at).toLocaleString()}</div>
          <div class="row">
            <button class="secondary" data-open> Abrir </button>
            <button class="secondary" data-dl> Descargar </button>
          </div>
        </div>
      `;

      const img = div.querySelector("img");
      setImgWithAuth(img, fileUrl).catch(() => {
        img.replaceWith(document.createTextNode("❌ No se pudo cargar miniatura"));
      });

      // Abrir
      div.querySelector("button[data-open]").addEventListener("click", async () => {
        try {
          const res = await fetch(fileUrl, { headers: { Authorization: `Bearer ${token}` }});
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          rememberObjectUrl(url);
          window.open(url, "_blank");
        } catch (err) {
          alert("No se pudo abrir: " + err.message);
        }
      });

      // Descargar
      div.querySelector("button[data-dl]").addEventListener("click", async () => {
        try {
          await downloadOne(fileUrl, m.original_name || "foto");
        } catch (err) {
          alert("No se pudo descargar: " + err.message);
        }
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

let selected = new Map(); // key: fileUrl, value: name

async function loadReceived() {
  clearObjectUrls();
  selected.clear();

  const area = el("receivedArea");
  area.innerHTML = `<div class="muted">Cargando…</div>`;

  try {
    const grouped = await api("/messages/received");
    const senders = Object.keys(grouped);

    if (!senders.length) {
      area.innerHTML = `<div class="muted">No hay recibidas.</div>`;
      return;
    }

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
          <img alt="" />
          <div class="meta">
            <label class="row" style="gap:6px">
              <input type="checkbox" data-url="${fileUrl}" data-name="${item.original_name || "foto"}" />
              <span>Seleccionar</span>
            </label>
            <div class="muted">${item.original_name || ""}</div>
            <div class="muted">Expira: ${new Date(item.expires_at).toLocaleString()}</div>
            <div class="row">
              <button class="secondary" data-open>Abrir</button>
              <button class="secondary" data-dl>Descargar</button>
            </div>
          </div>
        `;

        const img = div.querySelector("img");
        setImgWithAuth(img, fileUrl).catch(() => {
          img.replaceWith(document.createTextNode("❌ No se pudo cargar miniatura"));
        });

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
            rememberObjectUrl(url);
            window.open(url, "_blank");
          } catch (err) { alert(err.message); }
        });

        // download single
        div.querySelector("button[data-dl]").addEventListener("click", async () => {
          try {
            await downloadOne(fileUrl, item.original_name || "foto");
          } catch (err) {
            alert("No se pudo descargar: " + err.message);
          }
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
    for (const [u, n] of selected.entries()) {
      await downloadOne(u, n);
    }
    setStatus("✅ Descarga lanzada");
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
    await api("/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ newPassword })
    });
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