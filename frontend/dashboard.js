const API_BASE = window.API_BASE || "https://website-m71e.onrender.com";
const ADMIN_TOKEN_KEY = "pawMoodsAdminToken";
const DASH_SECTION_KEY = "pawMoodsDashboardSection";
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

const logoutBtn = document.getElementById("logoutBtn");
const toast = document.getElementById("toast");
const addCodeForm = document.getElementById("addCodeForm");
const globalSearch = document.getElementById("globalSearch");
const statusFilter = document.getElementById("statusFilter");
const typeFilter = document.getElementById("typeFilter");
const statsGrid = document.getElementById("statsGrid");
const analyticsCards = document.getElementById("analyticsCards");
const codeCards = document.getElementById("codeCards");
const orderCards = document.getElementById("orderCards");
const customerCards = document.getElementById("customerCards");
const detailsModal = document.getElementById("detailsModal");
const detailsContent = document.getElementById("detailsContent");
const closeDetailsBtn = document.getElementById("closeDetailsBtn");
const editModal = document.getElementById("editModal");
const editForm = document.getElementById("editForm");
const cancelEditBtn = document.getElementById("cancelEditBtn");
const codesPrevBtn = document.getElementById("codesPrevBtn");
const codesNextBtn = document.getElementById("codesNextBtn");
const customersPrevBtn = document.getElementById("customersPrevBtn");
const customersNextBtn = document.getElementById("customersNextBtn");
const codesPageInfo = document.getElementById("codesPageInfo");
const customersPageInfo = document.getElementById("customersPageInfo");
const ordersPrevBtn = document.getElementById("ordersPrevBtn");
const ordersNextBtn = document.getElementById("ordersNextBtn");
const ordersPageInfo = document.getElementById("ordersPageInfo");

const sections = {
  dashboard: document.getElementById("dashboardSection"),
  order: document.getElementById("orderSection"),
  orders: document.getElementById("ordersSection"),
  codes: document.getElementById("codesSection"),
  customers: document.getElementById("customersSection"),
  analytics: document.getElementById("analyticsSection"),
  settings: document.getElementById("settingsSection"),
};

const dynamicPageTitle = document.getElementById("dynamicPageTitle");
const mobileMenuBtn = document.getElementById("mobileMenuBtn");
const mobileCloseBtn = document.getElementById("mobileCloseBtn");
const appSidebar = document.getElementById("appSidebar");
const mobileOverlay = document.getElementById("mobileOverlay");

const sectionTitles = {
  dashboard: "Dashboard",
  order: "Add Order",
  orders: "Orders",
  codes: "Code Manager",
  customers: "Customers",
  analytics: "Analytics",
  settings: "Settings",
};

let allCodes = [];
let selectedEditCode = "";
let codesPage = 1;
let customersPage = 1;
let ordersPage = 1;
const PAGE_SIZE = 6;

function getToken() {
  return sessionStorage.getItem(ADMIN_TOKEN_KEY);
}

function clearToken() {
  sessionStorage.removeItem(ADMIN_TOKEN_KEY);
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.remove("hidden");
  setTimeout(() => toast.classList.add("hidden"), 2200);
}

function normalizeCode(value) {
  return String(value || "")
    .trim()
    .toUpperCase();
}

function openDetailsModal(item) {
  detailsContent.textContent = [
    `Code: ${item.code}`,
    `Type: ${item.type}`,
    `Customer: ${item.customerName}`,
    `Phone: ${item.customerPhone}`,
    `Order ID: ${item.orderId}`,
    `Product: ${item.productType || "Sticker"}`,
    `Order Value: Rs. ${item.orderValue || 0}`,
    `Purchase Date: ${formatDate(item.purchaseDate)}`,
    `Used: ${item.isUsed ? "Yes" : "No"}`,
    `Expiry: ${getExpiryStatus(item.purchaseDate)}`,
  ].join("\n");
  detailsModal.classList.remove("hidden");
}

function closeDetailsModal() {
  detailsModal.classList.add("hidden");
}

function openEditModal(item) {
  selectedEditCode = item.code;
  document.getElementById("editCustomerName").value = item.customerName || "";
  document.getElementById("editCustomerPhone").value = item.customerPhone || "";
  document.getElementById("editOrderId").value = item.orderId || "";
  document.getElementById("editProductType").value =
    item.productType || "Sticker";
  document.getElementById("editOrderValue").value = Number(
    item.orderValue || 0,
  );
  document.getElementById("editPurchaseDate").value = formatDate(
    item.purchaseDate,
  );
  document.getElementById("editIsUsed").value = item.isUsed ? "true" : "false";
  editModal.classList.remove("hidden");
}

function closeEditModal() {
  selectedEditCode = "";
  editModal.classList.add("hidden");
}

function paginate(items, page) {
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const start = (safePage - 1) * PAGE_SIZE;
  return {
    pageItems: items.slice(start, start + PAGE_SIZE),
    currentPage: safePage,
    totalPages,
  };
}

async function apiRequest(path, options = {}) {
  const token = getToken();
  if (!token) {
    window.location.href = "admin.html";
    throw new Error("Please login first");
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  
  let data = null;
  try {
    data = await response.json();
  } catch(e) {
    // If the server returns HTML (e.g. 404 fallback), this catch prevents the crash
    if (!response.ok) {
        if (response.status === 404) throw new Error("API endpoint not found (Did you restart the Node.js server?)");
        throw new Error(`Request failed with status ${response.status}`);
    }
  }

  if (!response.ok) {
    if (response.status === 403) {
      clearToken();
      window.location.href = "admin.html";
    }
    throw new Error(data?.message || "Request failed");
  }
  return data;
}

function formatDate(value) {
  if (!value) return "--";
  return new Date(value).toISOString().split("T")[0];
}

function getExpiryStatus(purchaseDate) {
  return Date.now() - new Date(purchaseDate).getTime() > THIRTY_DAYS_MS
    ? "expired"
    : "active";
}

function randomDigits(length) {
  return String(Math.floor(Math.random() * Math.pow(10, length))).padStart(
    length,
    "0",
  );
}

function buildCode(type) {
  return `PM26-ST${randomDigits(2)}-${type}${randomDigits(4)}`;
}

function detectTypeFromCode(code) {
  if (code.includes("-W")) return "W";
  if (code.includes("-T")) return "T";
  return null;
}

function enrichRecord(item) {
  const expiryStatus = getExpiryStatus(item.purchaseDate);
  return {
    ...item,
    expiryStatus,
    statusLabel: item.isUsed
      ? "used"
      : expiryStatus === "expired"
        ? "expired"
        : "active",
    rewardLabel: item.type === "W" ? "Winner" : "Try",
  };
}

function applyFilters(items) {
  const q = (globalSearch.value || "").trim().toLowerCase();
  const status = statusFilter.value;
  const type = typeFilter.value;

  return items.filter((item) => {
    const searchMatch =
      !q ||
      String(item.code || "")
        .toLowerCase()
        .includes(q) ||
      String(item.orderId || "")
        .toLowerCase()
        .includes(q) ||
      String(item.customerName || "")
        .toLowerCase()
        .includes(q) ||
      String(item.customerPhone || "")
        .toLowerCase()
        .includes(q);
    const statusMatch = status === "all" || item.statusLabel === status;
    const typeMatch = type === "all" || item.type === type;
    return searchMatch && statusMatch && typeMatch;
  });
}

function buildCustomerMap(items) {
  const map = new Map();
  for (const item of items) {
    const key = `${item.customerName}__${item.customerPhone}`;
    if (!map.has(key)) {
      map.set(key, {
        customerName: item.customerName,
        customerPhone: item.customerPhone,
        totalOrders: 0,
        lastOrderDate: item.purchaseDate,
        codes: [],
      });
    }
    const target = map.get(key);
    target.totalOrders += 1;
    target.codes.push(item.code);
    if (new Date(item.purchaseDate) > new Date(target.lastOrderDate)) {
      target.lastOrderDate = item.purchaseDate;
    }
  }
  return Array.from(map.values());
}

function renderStats(items) {
  const total = items.length;
  const active = items.filter((x) => x.statusLabel === "active").length;
  const used = items.filter((x) => x.statusLabel === "used").length;
  const expired = items.filter((x) => x.statusLabel === "expired").length;
  const winner = items.filter((x) => x.type === "W").length;
  const ratio = total ? `${winner}:${total - winner}` : "0:0";
  const stats = [
    ["Total Orders", total],
    ["Total Active Codes", active],
    ["Total Used Codes", used],
    ["Total Expired Codes", expired],
    ["Winner vs Try", ratio],
  ];

  statsGrid.innerHTML = stats
    .map(
      ([label, value]) =>
        `<article class="stats-card"><h4>${label}</h4><p>${value}</p></article>`,
    )
    .join("");
  analyticsCards.innerHTML = statsGrid.innerHTML;
}

function renderCodeCards(items) {
  if (!items.length) {
    codeCards.innerHTML = '<p class="empty-row">No matching records</p>';
    codesPageInfo.textContent = "Page 1 / 1";
    return;
  }

  const { pageItems, currentPage, totalPages } = paginate(items, codesPage);
  codesPage = currentPage;
  codesPageInfo.textContent = `Page ${currentPage} / ${totalPages}`;
  codesPrevBtn.disabled = currentPage <= 1;
  codesNextBtn.disabled = currentPage >= totalPages;

  codeCards.innerHTML = pageItems
    .map(
      (item) => `
      <article class="pos-card">
        <div class="pos-card-head">
          <h4>${item.code}</h4>
          <span class="status-pill ${item.statusLabel}">${item.statusLabel}</span>
        </div>
        <p><strong>Customer:</strong> ${item.customerName}</p>
        <p><strong>Phone:</strong> ${item.customerPhone}</p>
        <p><strong>Order ID:</strong> ${item.orderId || "--"}</p>
        <p><strong>Product:</strong> ${item.productType || "Sticker"}</p>
        <p><strong>Order Value:</strong> Rs. ${item.orderValue || 0}</p>
        <p><strong>Reward:</strong> ${item.rewardLabel}</p>
        <p><strong>Purchase:</strong> ${formatDate(item.purchaseDate)}</p>
        <p><strong>Expiry:</strong> ${item.expiryStatus}</p>
        <div class="pos-actions">
          <button class="mini-btn" data-action="copy" data-code="${item.code}">Copy</button>
          <button class="mini-btn" data-action="copy-order-id" data-order-id="${item.orderId || ""}">
            Copy Order ID
          </button>
          <button class="mini-btn" data-action="edit" data-code="${item.code}">Edit</button>
          <button class="mini-btn" data-action="toggle" data-code="${item.code}" data-used="${item.isUsed}">
            ${item.isUsed ? "Mark Unused" : "Mark Used"}
          </button>
          <button class="mini-btn" data-action="details" data-code="${item.code}">View Details</button>
          <button class="mini-btn danger" data-action="delete" data-code="${item.code}">Delete</button>
        </div>
      </article>`,
    )
    .join("");
}

function renderOrderCards(items) {
  if (!items.length) {
    orderCards.innerHTML = '<p class="empty-row">No order records</p>';
    ordersPageInfo.textContent = "Page 1 / 1";
    return;
  }

  const { pageItems, currentPage, totalPages } = paginate(items, ordersPage);
  ordersPage = currentPage;
  ordersPageInfo.textContent = `Page ${currentPage} / ${totalPages}`;
  ordersPrevBtn.disabled = currentPage <= 1;
  ordersNextBtn.disabled = currentPage >= totalPages;

  orderCards.innerHTML = pageItems
    .map(
      (item) => `
      <article class="pos-card">
        <div class="pos-card-head">
          <h4>${item.orderId || "--"}</h4>
          <span class="status-pill ${item.statusLabel}">${item.statusLabel}</span>
        </div>
        <p><strong>Customer:</strong> ${item.customerName}</p>
        <p><strong>Phone:</strong> ${item.customerPhone}</p>
        <p><strong>Code:</strong> ${item.code}</p>
        <p><strong>Type:</strong> ${item.rewardLabel}</p>
        <p><strong>Product:</strong> ${item.productType || "Sticker"}</p>
        <p><strong>Value:</strong> Rs. ${item.orderValue || 0}</p>
        <p><strong>Date:</strong> ${formatDate(item.purchaseDate)}</p>
        <div class="pos-actions">
          <button class="mini-btn" data-action="copy-order-id" data-order-id="${item.orderId || ""}">
            Copy Order ID
          </button>
          <button class="mini-btn" data-action="details" data-code="${item.code}">
            View Details
          </button>
        </div>
      </article>`,
    )
    .join("");
}

function renderCustomers(items) {
  const customers = buildCustomerMap(items);
  if (!customers.length) {
    customerCards.innerHTML = '<p class="empty-row">No customer records</p>';
    customersPageInfo.textContent = "Page 1 / 1";
    return;
  }
  const { pageItems, currentPage, totalPages } = paginate(
    customers,
    customersPage,
  );
  customersPage = currentPage;
  customersPageInfo.textContent = `Page ${currentPage} / ${totalPages}`;
  customersPrevBtn.disabled = currentPage <= 1;
  customersNextBtn.disabled = currentPage >= totalPages;

  customerCards.innerHTML = pageItems
    .map(
      (item) => `
      <article class="pos-card">
        <div class="pos-card-head"><h4>${item.customerName}</h4></div>
        <p><strong>Phone:</strong> ${item.customerPhone}</p>
        <p><strong>Total Orders:</strong> ${item.totalOrders}</p>
        <p><strong>Last Order:</strong> ${formatDate(item.lastOrderDate)}</p>
        <p><strong>Codes:</strong> ${item.codes.join(", ")}</p>
      </article>`,
    )
    .join("");
}

function renderAll() {
  const enriched = allCodes.map(enrichRecord);
  const filtered = applyFilters(enriched);
  renderStats(enriched);
  renderOrderCards(filtered);
  renderCodeCards(filtered);
  renderCustomers(filtered);
}

function switchSection(target) {
  sessionStorage.setItem(DASH_SECTION_KEY, target);
  Object.entries(sections).forEach(([key, section]) => {
    if (section) section.classList.toggle("hidden", key !== target);
  });
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.section === target);
  });
  if (dynamicPageTitle && sectionTitles[target]) {
    dynamicPageTitle.textContent = sectionTitles[target];
  }
  // Auto-close sidebar on mobile after clicking
  if (appSidebar) {
    appSidebar.classList.remove("open");
  }
  if (mobileOverlay) {
    mobileOverlay.classList.remove("visible");
  }
}

async function loadCodes() {
  const data = await apiRequest("/codes");
  allCodes = data.codes || [];
  renderAll();
}

async function handleCardAction(event) {
  const target = event.target;
  if (!(target instanceof HTMLButtonElement)) return;
  const action = target.dataset.action;
  const code = target.dataset.code;
  if (!action) return;

  if (action === "copy") {
    if (!code) return;
    await navigator.clipboard.writeText(code);
    showToast("Code copied");
    return;
  }

  if (action === "copy-order-id") {
    const orderId = target.dataset.orderId || "";
    if (!orderId) {
      showToast("Order ID not found");
      return;
    }
    await navigator.clipboard.writeText(orderId);
    showToast("Order ID copied");
    return;
  }

  if (action === "details") {
    if (!code) return;
    const item = allCodes.find(
      (x) => normalizeCode(x.code) === normalizeCode(code),
    );
    if (!item) {
      showToast("Could not load record details");
      return;
    }
    openDetailsModal(item);
    return;
  }

  if (action === "edit") {
    if (!code) return;
    const item = allCodes.find(
      (x) => normalizeCode(x.code) === normalizeCode(code),
    );
    if (!item) return;
    openEditModal(item);
    return;
  }

  if (action === "toggle") {
    if (!code) return;
    const current = target.dataset.used === "true";
    await apiRequest("/mark-used", {
      method: "POST",
      body: JSON.stringify({ code, isUsed: !current }),
    });
    showToast("Status updated");
    await loadCodes();
    return;
  }

  if (action === "delete") {
    if (!code) return;
    await apiRequest(`/codes/${encodeURIComponent(code)}`, {
      method: "DELETE",
    });
    showToast("Code deleted");
    await loadCodes();
  }
}

logoutBtn?.addEventListener("click", () => {
  clearToken();
  window.location.href = "admin.html";
});

addCodeForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const customerName = document.getElementById("customerName").value.trim();
  const customerPhone = document.getElementById("customerPhone").value.trim();
  const productType = document.getElementById("productType").value.trim();
  const orderValue = Number(document.getElementById("orderValue").value);
  const codeInput = document
    .getElementById("codeValue")
    .value.trim()
    .toUpperCase();
  const purchaseDate = document.getElementById("purchaseDate").value;
  const status = document.getElementById("codeStatus").value;
  const isUsed = status === "used";

  const code = codeInput || buildCode(Math.random() < 0.5 ? "W" : "T");
  if (!detectTypeFromCode(code)) {
    showToast("Code must include -W or -T");
    return;
  }

  try {
    const response = await apiRequest("/add-code", {
      method: "POST",
      body: JSON.stringify({
        code,
        customerName,
        customerPhone,
        productType,
        orderValue: Number.isNaN(orderValue) ? 0 : orderValue,
        purchaseDate: purchaseDate || formatDate(new Date()),
        isUsed,
      }),
    });
    addCodeForm.reset();
    document.getElementById("orderId").value = response.orderId || "";
    document.getElementById("purchaseDate").value = formatDate(new Date());
    showToast(`Order created: ${response.orderId || ""}`);
    await loadCodes();
    switchSection("codes");
  } catch (error) {
    showToast(error.message);
  }
});

document.querySelectorAll(".nav-btn").forEach((btn) => {
  btn.addEventListener("click", () => switchSection(btn.dataset.section));
});
codeCards?.addEventListener("click", async (event) => {
  try {
    await handleCardAction(event);
  } catch (error) {
    showToast(error.message);
  }
});
orderCards?.addEventListener("click", async (event) => {
  try {
    await handleCardAction(event);
  } catch (error) {
    showToast(error.message);
  }
});
closeDetailsBtn?.addEventListener("click", closeDetailsModal);
detailsModal?.addEventListener("click", (event) => {
  if (event.target === detailsModal) {
    closeDetailsModal();
  }
});
globalSearch?.addEventListener("input", renderAll);
statusFilter?.addEventListener("change", renderAll);
typeFilter?.addEventListener("change", renderAll);
codesPrevBtn?.addEventListener("click", () => {
  codesPage = Math.max(1, codesPage - 1);
  renderAll();
});
codesNextBtn?.addEventListener("click", () => {
  codesPage += 1;
  renderAll();
});
customersPrevBtn?.addEventListener("click", () => {
  customersPage = Math.max(1, customersPage - 1);
  renderAll();
});
customersNextBtn?.addEventListener("click", () => {
  customersPage += 1;
  renderAll();
});
ordersPrevBtn?.addEventListener("click", () => {
  ordersPage = Math.max(1, ordersPage - 1);
  renderAll();
});
ordersNextBtn?.addEventListener("click", () => {
  ordersPage += 1;
  renderAll();
});
cancelEditBtn?.addEventListener("click", closeEditModal);
editModal?.addEventListener("click", (event) => {
  if (event.target === editModal) closeEditModal();
});
editForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!selectedEditCode) return;

  const payload = {
    customerName: document.getElementById("editCustomerName").value.trim(),
    customerPhone: document.getElementById("editCustomerPhone").value.trim(),
    orderId: document.getElementById("editOrderId").value.trim(),
    productType:
      document.getElementById("editProductType").value.trim() || "Sticker",
    orderValue: Number(document.getElementById("editOrderValue").value),
    purchaseDate: document.getElementById("editPurchaseDate").value.trim(),
    isUsed: document.getElementById("editIsUsed").value === "true",
  };

  const item = allCodes.find(
    (x) => normalizeCode(x.code) === normalizeCode(selectedEditCode),
  );
  if (!item) {
    showToast("Record not found");
    closeEditModal();
    return;
  }

  const original = {
    customerName: String(item.customerName || "").trim(),
    customerPhone: String(item.customerPhone || "").trim(),
    orderId: String(item.orderId || "").trim(),
    productType: String(item.productType || "Sticker").trim(),
    orderValue: Number(item.orderValue || 0),
    purchaseDate: formatDate(item.purchaseDate).trim(),
    isUsed: Boolean(item.isUsed),
  };

  const hasChanges =
    payload.customerName !== original.customerName ||
    payload.customerPhone !== original.customerPhone ||
    payload.orderId !== original.orderId ||
    payload.productType !== original.productType ||
    Number(payload.orderValue) !== Number(original.orderValue) ||
    payload.purchaseDate !== original.purchaseDate ||
    payload.isUsed !== original.isUsed;

  if (!hasChanges) {
    showToast("No changes detected");
    return;
  }

  try {
    await apiRequest(`/codes/${encodeURIComponent(selectedEditCode)}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
    showToast("Record updated");
    closeEditModal();
    await loadCodes();
  } catch (error) {
    showToast(error.message || "Failed to update");
  }
});

async function loadSettings() {
  try {
    const data = await apiRequest("/settings");
    if (!data) return;

    // General
    const businessNameString = data.general?.businessName || "Paw & Moods";
    
    if (document.title.includes("Paw & Moods")) {
      document.title = document.title.replace("Paw & Moods", businessNameString);
    }
    document.querySelectorAll(".brand-text").forEach(el => {
      el.textContent = businessNameString;
    });
    document.querySelectorAll(".subtitle").forEach(el => {
      if (el.textContent.includes("Paw & Moods")) {
        el.textContent = el.textContent.replace("Paw & Moods", businessNameString);
      }
    });

    const bName = document.getElementById("setBusinessName");
    if(bName) bName.value = businessNameString;
    const cPhone = document.getElementById("setContactPhone");
    if(cPhone) cPhone.value = data.general?.contactPhone || "";
    const wNum = document.getElementById("setGeneralWhatsapp");
    if(wNum) wNum.value = data.general?.whatsappNumber || "";
    const curr = document.getElementById("setCurrency");
    if(curr) curr.value = data.general?.currency || "";
    const tz = document.getElementById("setTimezone");
    if(tz) tz.value = data.general?.timezone || "";

    // Rewards
    const wReward = document.getElementById("setWinnerReward");
    if(wReward) wReward.value = data.rewards?.defaultWinnerReward || "";
    const dPercent = document.getElementById("setDiscountPercent");
    if(dPercent) dPercent.value = data.rewards?.defaultDiscount || "";
    const expDays = document.getElementById("setExpiryDays");
    if(expDays) expDays.value = data.rewards?.expiryDays || "";
    const mOrder = document.getElementById("setMinOrder");
    if(mOrder) mOrder.value = data.rewards?.minOrderValue || "";
    const wEnabled = document.getElementById("setWinnerEnabled");
    if(wEnabled) wEnabled.checked = data.rewards?.winnerEnabled !== false;
    const tEnabled = document.getElementById("setTryEnabled");
    if(tEnabled) tEnabled.checked = data.rewards?.tryEnabled !== false;

    // Whatsapp
    const sWaNum = document.getElementById("setWaNumber");
    if(sWaNum) sWaNum.value = data.whatsapp?.whatsappNumber || "";
    const wMsg = document.getElementById("setWinnerTemplate");
    if(wMsg) wMsg.value = data.whatsapp?.winnerTemplate || "";
    const tMsg = document.getElementById("setTryTemplate");
    if(tMsg) tMsg.value = data.whatsapp?.tryTemplate || "";

    // Preferences
    const dmTog = document.getElementById("setDarkMode");
    if(dmTog) dmTog.checked = data.preferences?.darkMode || false;
    const animTog = document.getElementById("setAnimations");
    if(animTog) animTog.checked = data.preferences?.enableAnimations !== false;
    const defTab = document.getElementById("setDefaultTab");
    if(defTab) defTab.value = data.preferences?.defaultTab || "dashboard";

    // Security
    const sSecret = document.getElementById("setSecretAdminCode");
    if (sSecret) sSecret.value = data.security?.secretAdminCode || "admin777";
  } catch (err) {
    console.error(err);
  }
}

async function updateSettings(payload) {
  try {
    await apiRequest("/settings", {
      method: "PUT",
      body: JSON.stringify(payload)
    });
    showToast("Settings saved successfully");
  } catch (err) {
    showToast("Failed to save settings");
  }
}

function bindSettingsForms() {
  const submitWithLoading = async (btn, fn) => {
    if (!btn) return;
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Saving...";
    try {
      await fn();
    } finally {
      btn.disabled = false;
      btn.textContent = originalText;
    }
  };

  const formGen = document.getElementById("settingsGeneralForm");
  if(formGen) formGen.addEventListener("submit", (e) => {
    e.preventDefault();
    submitWithLoading(e.submitter, async () => {
      const newBusinessName = document.getElementById("setBusinessName").value;
      await updateSettings({
        general: {
          businessName: newBusinessName,
          contactPhone: document.getElementById("setContactPhone").value,
          whatsappNumber: document.getElementById("setGeneralWhatsapp").value,
          currency: document.getElementById("setCurrency").value,
          timezone: document.getElementById("setTimezone").value,
        }
      });
      // Instantly update the UI without refresh
      document.querySelectorAll(".brand-text").forEach(el => {
        el.textContent = newBusinessName || "Paw & Moods";
      });
      if (document.title.includes("| Dashboard")) {
        document.title = `${newBusinessName || "Paw & Moods"} | Dashboard`;
      }
    });
  });

  const formRew = document.getElementById("settingsRewardForm");
  if(formRew) formRew.addEventListener("submit", (e) => {
    e.preventDefault();
    submitWithLoading(e.submitter, async () => {
      await updateSettings({
        rewards: {
          defaultWinnerReward: Number(document.getElementById("setWinnerReward").value),
          defaultDiscount: Number(document.getElementById("setDiscountPercent").value),
          expiryDays: Number(document.getElementById("setExpiryDays").value),
          minOrderValue: Number(document.getElementById("setMinOrder").value),
          winnerEnabled: document.getElementById("setWinnerEnabled").checked,
          tryEnabled: document.getElementById("setTryEnabled").checked,
        }
      });
    });
  });

  const formWa = document.getElementById("settingsWhatsappForm");
  if(formWa) formWa.addEventListener("submit", (e) => {
    e.preventDefault();
    submitWithLoading(e.submitter, async () => {
      await updateSettings({
        whatsapp: {
          whatsappNumber: document.getElementById("setWaNumber").value,
          winnerTemplate: document.getElementById("setWinnerTemplate").value,
          tryTemplate: document.getElementById("setTryTemplate").value,
        }
      });
    });
  });

  const formPref = document.getElementById("settingsPrefsForm");
  if(formPref) formPref.addEventListener("submit", (e) => {
    e.preventDefault();
    submitWithLoading(e.submitter, async () => {
      await updateSettings({
        preferences: {
          darkMode: document.getElementById("setDarkMode").checked,
          enableAnimations: document.getElementById("setAnimations").checked,
          defaultTab: document.getElementById("setDefaultTab").value,
        }
      });
    });
  });

  const formSec = document.getElementById("settingsSecurityForm");
  if(formSec) formSec.addEventListener("submit", (e) => {
    e.preventDefault();
    submitWithLoading(e.submitter, async () => {
      const curr = document.getElementById("setCurrentPassword").value;
      const next = document.getElementById("setNewPassword").value;
      const conf = document.getElementById("setConfirmPassword").value;

      if (next !== conf) {
        showToast("New passwords do not match");
        return;
      }

      try {
        const res = await apiRequest("/admin/change-password", {
          method: "POST",
          body: JSON.stringify({ currentPassword: curr, newPassword: next })
        });
        showToast(res.message || "Password updated");
        document.getElementById("settingsSecurityForm").reset();
      } catch(err) {
        showToast(err.message || "Failed to update password");
      }
    });
  });

  const formSecret = document.getElementById("settingsSecretForm");
  if(formSecret) formSecret.addEventListener("submit", (e) => {
    e.preventDefault();
    submitWithLoading(e.submitter, async () => {
      await updateSettings({
        security: {
          secretAdminCode: document.getElementById("setSecretAdminCode").value
        }
      });
    });
  });

  document.querySelectorAll(".eye-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetId = btn.getAttribute("data-target");
      const input = document.getElementById(targetId);
      if (input) {
        if (input.type === "password") {
          input.type = "text";
        } else {
          input.type = "password";
        }
      }
    });
  });
}

async function init() {
  if (!getToken()) {
    window.location.href = "admin.html";
    return;
  }
  document.getElementById("purchaseDate").value = formatDate(new Date());
  document.getElementById("orderId").value = "Auto-generated on save";
  
  await loadSettings();
  bindSettingsForms();

  const lastSection = sessionStorage.getItem(DASH_SECTION_KEY);
  const selectDef = document.getElementById("setDefaultTab");
  const defaultTab = selectDef ? selectDef.value : "dashboard";
  
  if (lastSection && sections[lastSection]) {
    switchSection(lastSection);
  } else {
    switchSection(defaultTab || "dashboard");
  }

  // Mobile menu events
  mobileMenuBtn?.addEventListener("click", () => {
    appSidebar?.classList.add("open");
    mobileOverlay?.classList.add("visible");
  });

  mobileCloseBtn?.addEventListener("click", () => {
    appSidebar?.classList.remove("open");
    mobileOverlay?.classList.remove("visible");
  });

  mobileOverlay?.addEventListener("click", () => {
    appSidebar?.classList.remove("open");
    mobileOverlay?.classList.remove("visible");
  });

  await loadCodes();
}

init().catch((error) => {
  clearToken();
  window.location.href = "admin.html";
  showToast(error.message || "Session expired");
});
