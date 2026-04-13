const STORAGE_KEY = "pawMoodsCode";
const ACCESS_KEY = "pawMoodsRewardAccess";
const API_BASE = window.API_BASE || "";

function getTailValue(code) {
  const lastTwo = code.slice(-2);
  const parsed = Number.parseInt(lastTwo, 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function toUserMessage(reason) {
  switch (reason) {
    case "EXPIRED":
      return "This code has expired";
    case "USED":
      return "This code is already used";
    case "NOT_FOUND":
      return "Invalid or unauthorized code";
    case "INVALID_FORMAT":
      return "Invalid Code";
    default:
      return "Could not validate code right now";
  }
}

async function validateCodeFromApi(rawCode) {
  const code = rawCode.trim().toUpperCase();
  const response = await fetch(
    `${API_BASE}/validate-code/${encodeURIComponent(code)}`
  );
  const data = await response.json();
  return { ok: response.ok, data, code };
}

function storeAccessSession(data) {
  localStorage.setItem(STORAGE_KEY, data.code);
  sessionStorage.setItem(
    ACCESS_KEY,
    JSON.stringify({
      code: data.code,
      type: data.type,
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
  const target = `index.html?error=${encodeURIComponent(message)}`;
  window.location.href = target;
}

function setupHomePage() {
  const form = document.getElementById("codeForm");
  const input = document.getElementById("rewardCode");
  const error = document.getElementById("errorMessage");
  if (!form || !input || !error) return;

  const params = new URLSearchParams(window.location.search);
  const initialError = params.get("error");
  if (initialError) {
    error.textContent = initialError;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    error.textContent = "";

    try {
      const { ok, data, code } = await validateCodeFromApi(input.value);
      if (!ok || !data.valid) {
        error.textContent = toUserMessage(data.reason);
        return;
      }

      storeAccessSession({ code, type: data.type });
      window.location.href = data.type === "W" ? "winner.html" : "try.html";
    } catch (requestError) {
      error.textContent = "Server error. Please try again.";
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
    const { ok, data, code } = await validateCodeFromApi(savedCode);
    if (!ok || !data.valid || data.type !== expectedType) {
      clearAccessSession();
      redirectHomeWithError(toUserMessage(data.reason));
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
    redirectHomeWithError("Server error. Please try again.");
  }
}

if (document.body.dataset.page === "home") {
  setupHomePage();
} else if (
  document.body.dataset.page === "winner" ||
  document.body.dataset.page === "try"
) {
  setupResultPage();
}
