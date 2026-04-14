const API_BASE = window.API_BASE || "https://website-m71e.onrender.com";
const ADMIN_TOKEN_KEY = "pawMoodsAdminToken";
const loginWrap = document.getElementById("loginWrap");
const loginForm = document.getElementById("adminLoginForm");
const adminError = document.getElementById("adminError");
const toast = document.getElementById("toast");
const forgotToggleBtn = document.getElementById("forgotToggleBtn");
const forgotPasswordForm = document.getElementById("forgotPasswordForm");
const verifyResetKeyBtn = document.getElementById("verifyResetKeyBtn");
const resetKeyStep = document.getElementById("resetKeyStep");
const newPasswordStep = document.getElementById("newPasswordStep");
const passwordToggleButtons = document.querySelectorAll(".password-toggle");

let verifiedResetKey = "";

function getToken() {
  return sessionStorage.getItem(ADMIN_TOKEN_KEY);
}

function setToken(token) {
  sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
}

function clearToken() {
  sessionStorage.removeItem(ADMIN_TOKEN_KEY);
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.remove("hidden");
  setTimeout(() => toast.classList.add("hidden"), 2200);
}

function setError(message = "") {
  adminError.textContent = message;
}

function showLoginOnly(message = "") {
  loginWrap.classList.remove("hidden");
  setError(message);
}

function normalizeErrorMessage(message) {
  if (!message) return "Request failed";
  if (message.includes("Please login first")) return "Please login first";
  if (message.includes("Invalid token")) return "Invalid token. Please login again.";
  if (message.includes("Expired session")) return "Expired session. Please login again.";
  return message;
}

async function apiRequest(path, options = {}) {
  const token = getToken();
  const isLoginRoute = path === "/admin/login";
  const isForgotRoute = path === "/admin/forgot-password";
  const isVerifyResetRoute = path === "/admin/verify-reset-key";
  if (!isLoginRoute && !isForgotRoute && !isVerifyResetRoute && !token) {
    throw new Error("Please login first");
  }

  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  if (!isLoginRoute && !isForgotRoute && !isVerifyResetRoute) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });
  const contentType = response.headers.get("content-type") || "";
  let data = {};
  
  if (contentType.includes("application/json")) {
    data = await response.json();
  } else {
    // If we receive an HTML 404 page (e.g. from Netlify) instead of JSON, we handle it natively.
    if (!response.ok) {
      throw new Error(`Server connection failed. Make sure your API_BASE (${API_BASE}) is correct and the backend is running.`);
    }
  }

  if (!response.ok) {
    const message = normalizeErrorMessage(data.message || "Request failed");
    if (response.status === 403) clearToken();
    throw new Error(message);
  }
  return data;
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
    window.location.href = "dashboard.html";
  } catch (error) {
    setError(error.message || "Invalid admin password");
  }
});

forgotToggleBtn?.addEventListener("click", () => {
  verifiedResetKey = "";
  document.getElementById("resetKey").value = "";
  document.getElementById("newPassword").value = "";
  resetKeyStep.classList.remove("hidden");
  newPasswordStep.classList.add("hidden");
  forgotPasswordForm.classList.toggle("hidden");
});

verifyResetKeyBtn?.addEventListener("click", async () => {
  const resetKey = document.getElementById("resetKey").value.trim();
  if (!resetKey) {
    showToast("Enter reset key");
    return;
  }
  try {
    await apiRequest("/admin/verify-reset-key", {
      method: "POST",
      body: JSON.stringify({ resetKey }),
    });
    verifiedResetKey = resetKey;
    resetKeyStep.classList.add("hidden");
    newPasswordStep.classList.remove("hidden");
    showToast("Reset key verified");
  } catch (error) {
    showToast(error.message || "Invalid reset key");
  }
});

forgotPasswordForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const newPassword = document.getElementById("newPassword").value;
  if (!verifiedResetKey) {
    showToast("Verify reset key first");
    return;
  }
  try {
    const data = await apiRequest("/admin/forgot-password", {
      method: "POST",
      body: JSON.stringify({ resetKey: verifiedResetKey, newPassword }),
    });
    showToast(data.message || "Password reset successful");
    verifiedResetKey = "";
    forgotPasswordForm.reset();
    resetKeyStep.classList.remove("hidden");
    newPasswordStep.classList.add("hidden");
    forgotPasswordForm.classList.add("hidden");
  } catch (error) {
    showToast(error.message || "Failed to reset password");
  }
});

passwordToggleButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const inputId = button.dataset.target;
    const input = document.getElementById(inputId);
    if (!input) return;
    const showing = input.type === "text";
    input.type = showing ? "password" : "text";
    button.textContent = showing ? "Show" : "Hide";
  });
});
showLoginOnly("");
forgotPasswordForm?.classList.add("hidden");
resetKeyStep?.classList.remove("hidden");
newPasswordStep?.classList.add("hidden");

async function applyAdminBranding() {
  try {
    const response = await fetch(`${API_BASE}/api/public-settings`);
    if (response.ok) {
      const settings = await response.json();
      const bName = settings.businessName || "Paw & Moods";

      if (document.title.includes("Paw & Moods")) {
        document.title = document.title.replace("Paw & Moods", bName);
      }
      const posTitle = document.querySelector(".pos-login-card h1");
      if (posTitle && posTitle.textContent.includes("Paw & Moods")) {
        posTitle.textContent = posTitle.textContent.replace("Paw & Moods", bName);
      }
    }
  } catch (e) {}
}

applyAdminBranding();
