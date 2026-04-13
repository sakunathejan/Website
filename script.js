const STORAGE_KEY = "pawMoodsCode";
const ACCESS_KEY = "pawMoodsRewardAccess";
const API_BASE = window.API_BASE || "https://your-backend-url.onrender.com";

function getTailValue(code) {
  const lastTwo = code.slice(-2);
  const parsed = Number.parseInt(lastTwo, 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function getStatusMessage(status) {
  if (status === "expired") return "This code has expired";
  if (status === "used") return "This code has already been used";
  if (status === "invalid") return "Invalid code";
  return "Server error. Please try again later";
}

// Validate a code with backend API instead of local pattern checks.
async function validateCodeFromApi(rawCode) {
  const code = rawCode.trim().toUpperCase();
  const response = await fetch(
    `${API_BASE}/validate-code/${encodeURIComponent(code)}`
  );
  const data = await response.json();
  return { code, data };
}

// Save successful validation details for result-page protection.
function storeAccessSession(code, type) {
  localStorage.setItem(STORAGE_KEY, code);
  sessionStorage.setItem(
    ACCESS_KEY,
    JSON.stringify({
      code,
      type,
      validatedAt: Date.now(),
    })
  );
}

function getAccessSession() {
  const raw = sessionStorage.getItem(ACCESS_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
}

function clearAccessSession() {
  sessionStorage.removeItem(ACCESS_KEY);
}

function redirectHomeWithError(message) {
  window.location.href = `index.html?error=${encodeURIComponent(message)}`;
}

function setupHomePage() {
  const form = document.getElementById("codeForm");
  const input = document.getElementById("rewardCode");
  const error = document.getElementById("errorMessage");
  if (!form || !input || !error) return;

  // Show any forwarded error from guarded pages.
  const params = new URLSearchParams(window.location.search);
  const initialError = params.get("error");
  if (initialError) {
    error.textContent = initialError;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    error.textContent = "";

    try {
      // 1) Capture code and call backend validation endpoint.
      const { code, data } = await validateCodeFromApi(input.value);

      // 2) Handle backend response and route based on reward type.
      if (data.status === "valid" && data.type === "W") {
        storeAccessSession(code, "W");
        window.location.href = "winner.html";
        return;
      }

      if (data.status === "valid" && data.type === "T") {
        storeAccessSession(code, "T");
        window.location.href = "try.html";
        return;
      }

      // 3) Show expected user-facing messages for non-valid statuses.
      error.textContent = getStatusMessage(data.status);
    } catch (requestError) {
      // 4) Network/server failure fallback message.
      error.textContent = "Server error. Please try again later";
    }
  });
}

async function setupResultPage() {
  const pageType = document.body.dataset.page;
  const savedCode = localStorage.getItem(STORAGE_KEY);
  const access = getAccessSession();
  const codeEl = document.getElementById("savedCode");
  const valueEl = document.getElementById("dynamicValue");
  const messageEl = document.getElementById("dynamicMessage");

  if (!savedCode || !access || !codeEl || !valueEl || !messageEl || !pageType) {
    redirectHomeWithError("Please enter a valid code first");
    return;
  }

  const expectedType = pageType === "winner" ? "W" : "T";
  if (access.code !== savedCode || access.type !== expectedType) {
    clearAccessSession();
    redirectHomeWithError("Unauthorized page access");
    return;
  }

  try {
    const { code, data } = await validateCodeFromApi(savedCode);
    if (data.status !== "valid" || data.type !== expectedType) {
      clearAccessSession();
      redirectHomeWithError(getStatusMessage(data.status));
      return;
    }

    codeEl.textContent = code;
    const rewardAmount = getTailValue(code);
    valueEl.textContent = String(rewardAmount);

    if (pageType === "winner") {
      messageEl.textContent = `You get ${rewardAmount} free stickers`;
      const whatsappBtn = document.getElementById("whatsappBtn");
      if (whatsappBtn) {
        const text = encodeURIComponent(
          `Hi Paw & Moods! I unlocked a reward with code: ${code}`
        );
        whatsappBtn.href = `https://wa.me/?text=${text}`;
      }
      return;
    }

    messageEl.textContent = `You get ${rewardAmount}% OFF`;
    const discountBtn = document.getElementById("discountBtn");
    if (discountBtn) {
      discountBtn.setAttribute("title", `Use this code: ${code}`);
    }
  } catch (requestError) {
    clearAccessSession();
    redirectHomeWithError("Server error. Please try again later");
  }
}

if (document.body.dataset.page === "home") {
  setupHomePage();
} else if (document.body.dataset.page === "winner" || document.body.dataset.page === "try") {
  setupResultPage();
}
