const API_BASE = window.API_BASE || "";
const ADMIN_TOKEN_KEY = "pawMoodsAdminToken";

const adminError = document.getElementById("adminError");
const loginForm = document.getElementById("adminLoginForm");
const adminApp = document.getElementById("adminApp");
const addCodeForm = document.getElementById("addCodeForm");
const codesTableBody = document.getElementById("codesTableBody");

function setError(message = "") {
  adminError.textContent = message;
}

function getToken() {
  return sessionStorage.getItem(ADMIN_TOKEN_KEY);
}

function setToken(token) {
  sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
}

async function apiRequest(path, options = {}) {
  const token = getToken();
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || "Request failed");
  }
  return data;
}

function formatDate(value) {
  if (!value) return "--";
  return new Date(value).toISOString().split("T")[0];
}

function renderRows(codes) {
  if (!codes.length) {
    codesTableBody.innerHTML =
      '<tr><td colspan="5" class="empty-row">No codes yet</td></tr>';
    return;
  }

  codesTableBody.innerHTML = codes
    .map(
      (item) => `
      <tr>
        <td>${item.code}</td>
        <td>${item.type}</td>
        <td>${formatDate(item.purchaseDate)}</td>
        <td>${item.isUsed ? "used" : "unused"}</td>
        <td>
          <button class="mini-btn" data-action="toggle" data-code="${item.code}" data-used="${item.isUsed}">
            ${item.isUsed ? "Mark Unused" : "Mark Used"}
          </button>
          <button class="mini-btn danger" data-action="delete" data-code="${item.code}">
            Delete
          </button>
        </td>
      </tr>
    `
    )
    .join("");
}

async function loadCodes() {
  const data = await apiRequest("/codes");
  renderRows(data.codes || []);
}

loginForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  setError("");

  const password = document.getElementById("adminPassword").value;
  try {
    const data = await apiRequest("/admin/login", {
      method: "POST",
      body: JSON.stringify({ password }),
    });
    setToken(data.token);
    loginForm.classList.add("hidden");
    adminApp.classList.remove("hidden");
    await loadCodes();
  } catch (error) {
    setError("Invalid admin password");
  }
});

addCodeForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  setError("");

  const code = document.getElementById("codeValue").value.trim().toUpperCase();
  const purchaseDate = document.getElementById("purchaseDate").value;
  const status = document.getElementById("codeStatus").value;
  const isUsed = status === "used";

  try {
    await apiRequest("/add-code", {
      method: "POST",
      body: JSON.stringify({ code, purchaseDate, isUsed }),
    });
    addCodeForm.reset();
    await loadCodes();
  } catch (error) {
    setError(error.message);
  }
});

codesTableBody?.addEventListener("click", async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLButtonElement)) return;
  const action = target.dataset.action;
  const code = target.dataset.code;
  if (!action || !code) return;

  setError("");
  try {
    if (action === "toggle") {
      const current = target.dataset.used === "true";
      await apiRequest("/mark-used", {
        method: "POST",
        body: JSON.stringify({ code, isUsed: !current }),
      });
    } else if (action === "delete") {
      await apiRequest(`/codes/${encodeURIComponent(code)}`, {
        method: "DELETE",
      });
    }
    await loadCodes();
  } catch (error) {
    setError(error.message);
  }
});

async function initializeAdmin() {
  if (!getToken()) return;

  loginForm.classList.add("hidden");
  adminApp.classList.remove("hidden");
  try {
    await loadCodes();
  } catch (error) {
    sessionStorage.removeItem(ADMIN_TOKEN_KEY);
    loginForm.classList.remove("hidden");
    adminApp.classList.add("hidden");
    setError("Session expired. Please login again.");
  }
}

initializeAdmin();
