const STORAGE_KEY = "pawMoodsCode";
const ACCESS_KEY = "pawMoodsRewardAccess";
const TYPE_KEY = "pawMoodsRewardType";
const API_BASE = window.API_BASE || "https://website-m71e.onrender.com";
const WHATSAPP_NUMBER = window.PAWS_WHATSAPP_NUMBER || "+940783418485";

function getTailValue(code) {
  const lastTwo = code.slice(-2);
  const parsed = Number.parseInt(lastTwo, 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function getStatusMessage(status) {
  if (status === "disabled") return "This type of reward is currently disabled";
  if (status === "expired") return "This code has expired";
  if (status === "used") return "This code has already been used";
  if (status === "invalid") return "Invalid code";
  return "Server error. Please try again later";
}

function normalizeStatus(data) {
  if (data?.reason === "REWARD_DISABLED") return "disabled";
  if (data?.status) return String(data.status).toLowerCase();
  if (data?.reason === "EXPIRED") return "expired";
  if (data?.reason === "USED") return "used";
  if (data?.reason === "NOT_FOUND" || data?.reason === "INVALID_FORMAT")
    return "invalid";
  if (data?.valid === true) return "valid";
  return "error";
}

// Validate a code with backend API instead of local pattern checks.
async function validateCodeFromApi(rawCode) {
  const code = rawCode.trim().toUpperCase();
  const response = await fetch(
    `${API_BASE}/validate-code/${encodeURIComponent(code)}`,
  );
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    return { code, data: { status: "error" } };
  }
  const data = await response.json();
  return { code, data };
}

async function claimCodeFromApi(code) {
  const response = await fetch(`${API_BASE}/claim-code`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
  const data = await response.json();
  return { ok: response.ok, data };
}

// Save successful validation details for result-page protection.
function storeAccessSession(code, type) {
  localStorage.setItem(STORAGE_KEY, code);
  localStorage.setItem(TYPE_KEY, type);
  sessionStorage.setItem(
    ACCESS_KEY,
    JSON.stringify({
      code,
      type,
      validatedAt: Date.now(),
    }),
  );
}

function getAccessSession() {
  const raw = sessionStorage.getItem(ACCESS_KEY);
  if (!raw) {
    // Fallback so refresh doesn't kick users back to home.
    const code = localStorage.getItem(STORAGE_KEY);
    const type = localStorage.getItem(TYPE_KEY);
    if (code && (type === "W" || type === "T")) {
      return { code, type, validatedAt: 0 };
    }
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
}

function clearAccessSession() {
  sessionStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(TYPE_KEY);
}

function redirectHomeWithError(message) {
  window.location.href = `index.html?error=${encodeURIComponent(message)}`;
}

function setupHomePage() {
  const form = document.getElementById("codeForm");
  const input = document.getElementById("rewardCode");
  const error = document.getElementById("errorMessage");
  const minOrderText = document.getElementById("minOrderText");
  if (!form || !input || !error) return;

  // Fetch Public Settings for dynamic display strings
  try {
    fetch(`${API_BASE}/api/public-settings`)
      .then((res) => (res.ok ? res.json() : {}))
      .then((settings) => {
        if (settings.minOrderValue && minOrderText) {
          minOrderText.textContent = `Valid for orders over ${settings.currency || "Rs"} ${settings.minOrderValue}`;
        }
      })
      .catch(() => {});
  } catch (e) {}

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
      const status = normalizeStatus(data);
      if (status === "valid" && data.type === "W") {
        storeAccessSession(code, "W");
        window.location.href = "winner.html";
        return;
      }

      if (status === "valid" && data.type === "T") {
        storeAccessSession(code, "T");
        window.location.href = "try.html";
        return;
      }

      // 3) Show expected user-facing messages for non-valid statuses.
      error.textContent = getStatusMessage(status);
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
    const status = normalizeStatus(data);
    if (status !== "valid" || data.type !== expectedType) {
      clearAccessSession();
      redirectHomeWithError(getStatusMessage(status));
      return;
    }

    // Fetch dynamic settings from admin API
    let settings = {};
    try {
      const sRes = await fetch(`${API_BASE}/api/public-settings`);
      if (sRes.ok) settings = await sRes.json();
    } catch(e) {}

    // Unlock the UI
    document.body.style.opacity = "1";
    document.body.style.pointerEvents = "auto";

    const rawWaNum = settings.whatsappNumber || WHATSAPP_NUMBER;
    const dynamicWaNum = String(rawWaNum).replace(/[^0-9]/g, "");

    codeEl.textContent = code;
    
    let rewardAmount = getTailValue(code);
    if (pageType === "winner" && settings.defaultWinnerReward) {
      rewardAmount = settings.defaultWinnerReward;
    } else if (pageType === "try" && settings.defaultDiscount) {
      rewardAmount = settings.defaultDiscount;
    }

    valueEl.textContent = String(rewardAmount);

    const minOrderDisplay = document.getElementById("minOrderDisplay");
    if (minOrderDisplay && settings.minOrderValue) {
      minOrderDisplay.textContent = `📌 Minimum order ${settings.currency || "Rs."} ${settings.minOrderValue}`;
    }

    const validDaysDisplay = document.getElementById("validDaysDisplay");
    if (validDaysDisplay && settings.expiryDays) {
      // If exactly 48 or 72 hrs logic desired by user, 1 day = 24hrs.
      // But typically settings.expiryDays is in days, let's display days.
      validDaysDisplay.textContent = `⏳ Valid for ${settings.expiryDays} days`;
    }

    if (pageType === "winner") {
      messageEl.textContent = `You get ${rewardAmount} free stickers`;
      const startShoppingBtn = document.getElementById("startShoppingBtn");
      const whatsappBtn = document.getElementById("whatsappBtn");
      
      const bName = settings.businessName || "Paw & Moods";
      const defaultWinnerMessage = `Hi ${bName} \u{1F49C}
I just claimed my reward \u{1F389}

Code: ${code}
I won: ANY ${rewardAmount} FREE stickers \u{1F381}

Please guide me on how to redeem it \u{1F60A}`;

      const winnerWhatsappMessage = settings.winnerTemplate 
        ? settings.winnerTemplate
            .replace(/{code}/g, code)
            .replace(/{reward}/g, String(rewardAmount))
            .replace(/{discount}/g, String(settings.defaultDiscount || 10))
        : defaultWinnerMessage;

      async function claimAndUpdateUI() {
        const claim = await claimCodeFromApi(code);
        if (!claim.ok && claim.data?.status === "used") {
          messageEl.textContent = "This reward code is already claimed";
          return false;
        }
        if (!claim.ok && claim.data?.status === "expired") {
          messageEl.textContent = "This code has expired";
          return false;
        }
        if (!claim.ok) {
          messageEl.textContent = "Unable to claim right now";
          return false;
        }
        messageEl.textContent = "Reward claimed successfully";
        return true;
      }

      if (startShoppingBtn) {
        startShoppingBtn.addEventListener("click", async (event) => {
          event.preventDefault();
          const claimed = await claimAndUpdateUI();
          if (claimed) {
            startShoppingBtn.textContent = "Claimed";
          }
        });
      }

      if (whatsappBtn) {
        whatsappBtn.addEventListener("click", async (event) => {
          event.preventDefault();
          const ok = await claimAndUpdateUI();
          if (ok) {
            // Encode safely and immediately trigger window navigation
            const encodedMessage = encodeURIComponent(winnerWhatsappMessage);
            const url = `https://wa.me/${dynamicWaNum}?text=${encodedMessage}`;
            window.open(url, "_blank", "noopener,noreferrer");
          }
        });
      }

      const copyBtn = document.getElementById("copyMessageBtn");
      if (copyBtn) {
        copyBtn.addEventListener("click", async (e) => {
          e.preventDefault();
          try {
            await navigator.clipboard.writeText(winnerWhatsappMessage);
            const orig = copyBtn.textContent;
            copyBtn.textContent = "✅ Copied to clipboard!";
            setTimeout(() => { copyBtn.textContent = orig; }, 2000);
          } catch(err) {
            console.error(err);
          }
        });
      }
      return;
    }

    messageEl.textContent = `You get ${rewardAmount}% OFF`;
    const shopNowBtn = document.getElementById("shopNowBtn");
    const discountBtn = document.getElementById("discountBtn");
    
    const bName = settings.businessName || "Paw & Moods";
    const defaultTryMessage = `Hi ${bName} \u{1F49C}
I just checked my reward \u{1F381}

Code: ${code}
I received: ${rewardAmount}% OFF discount \u{1F4B8}

Please help me apply this on my next order \u{1F60A}`;

    const tryWhatsappMessage = settings.tryTemplate
      ? settings.tryTemplate
          .replace(/{code}/g, code)
          .replace(/{reward}/g, String(settings.defaultWinnerReward || 5))
          .replace(/{discount}/g, String(rewardAmount))
      : defaultTryMessage;

    async function claimDiscount() {
      const claim = await claimCodeFromApi(code);
      if (!claim.ok && claim.data?.status === "used") {
        messageEl.textContent = "This discount code is already used";
        return false;
      }
      if (!claim.ok && claim.data?.status === "expired") {
        messageEl.textContent = "This code has expired";
        return false;
      }
      if (!claim.ok) {
        messageEl.textContent = "Unable to apply discount right now";
        return false;
      }
      messageEl.textContent = `Discount applied: ${rewardAmount}% OFF`;
      return true;
    }

    if (shopNowBtn) {
      shopNowBtn.addEventListener("click", async (event) => {
        event.preventDefault();
        await claimDiscount();
      });
    }

    if (discountBtn) {
      discountBtn.setAttribute("title", `Use this code: ${code}`);
      discountBtn.addEventListener("click", async (event) => {
        event.preventDefault();
        const ok = await claimDiscount();
        if (ok) {
          const encodedMessage = encodeURIComponent(tryWhatsappMessage);
          const url = `https://wa.me/${dynamicWaNum}?text=${encodedMessage}`;
          window.open(url, "_blank", "noopener,noreferrer");
          discountBtn.textContent = "Claimed & Sent";
        }
      });
    }

    const copyBtn = document.getElementById("copyMessageBtn");
    if (copyBtn) {
      copyBtn.addEventListener("click", async (e) => {
        e.preventDefault();
        try {
          await navigator.clipboard.writeText(tryWhatsappMessage);
          const orig = copyBtn.textContent;
          copyBtn.textContent = "✅ Copied to clipboard!";
          setTimeout(() => { copyBtn.textContent = orig; }, 2000);
        } catch(err) {
          console.error(err);
        }
      });
    }
  } catch (requestError) {
    clearAccessSession();
    redirectHomeWithError("Server error. Please try again later");
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

async function applyGlobalBranding() {
  try {
    const sRes = await fetch(`${API_BASE}/api/public-settings`);
    if (sRes.ok) {
      const settings = await sRes.json();
      const bName = settings.businessName || "Paw & Moods";

      // Update document title dynamically
      if (document.title.includes("Paw & Moods")) {
        document.title = document.title.replace("Paw & Moods", bName);
      }

      document.querySelectorAll(".brand-text").forEach(el => {
        el.textContent = bName;
      });

      document.querySelectorAll(".subtitle").forEach(el => {
        if (el.textContent.includes("Paw & Moods")) {
          el.textContent = el.textContent.replace("Paw & Moods", bName);
        }
      });
    }
  } catch(e) {}
}

applyGlobalBranding();
