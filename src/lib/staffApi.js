const STAFF_TOKEN_KEY = "light-form-staff-token";

export const staffApiConfig = {
  baseUrl: (import.meta.env.VITE_STAFF_API_BASE_URL || "http://localhost:8787").replace(/\/$/, "")
};

export function getStaffToken() {
  try {
    return window.localStorage.getItem(STAFF_TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

export function saveStaffToken(token) {
  try {
    if (token) {
      window.localStorage.setItem(STAFF_TOKEN_KEY, token);
    } else {
      window.localStorage.removeItem(STAFF_TOKEN_KEY);
    }
  } catch {
    return;
  }
}

export async function staffRequest(path, { method = "GET", body, token = getStaffToken() } = {}) {
  const response = await fetch(`${staffApiConfig.baseUrl}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body == null ? undefined : JSON.stringify(body)
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error?.message || `Staff API failed: ${response.status}`);
  }
  return payload;
}

export function staffLogin(email, password) {
  return staffRequest("/api/auth/login", {
    method: "POST",
    token: "",
    body: { email, password }
  });
}

export function getStaffMe() {
  return staffRequest("/api/auth/me");
}

export function listStaffUsers() {
  return staffRequest("/api/staff/users");
}

export function listStaffPermissionConfig() {
  return staffRequest("/api/staff/permissions");
}

export function createStaffUser(input) {
  return staffRequest("/api/staff/users", {
    method: "POST",
    body: input
  });
}

export function updateStaffUser(userId, input) {
  return staffRequest(`/api/staff/users/${encodeURIComponent(userId)}`, {
    method: "PATCH",
    body: input
  });
}

export function searchStaffInventory(query) {
  const params = new URLSearchParams({ q: query, first: "25" });
  return staffRequest(`/api/inventory/search?${params.toString()}`);
}

export function searchStaffProducts(query) {
  const params = new URLSearchParams({ q: query, first: "25" });
  return staffRequest(`/api/products/search?${params.toString()}`);
}

export function createStaffProduct(input) {
  return staffRequest("/api/products", {
    method: "POST",
    body: input
  });
}

export function updateStaffProduct(productId, input) {
  return staffRequest(`/api/products/${encodeURIComponent(productId)}`, {
    method: "PATCH",
    body: input
  });
}

export function archiveStaffProduct(productId) {
  return staffRequest(`/api/products/${encodeURIComponent(productId)}`, {
    method: "DELETE"
  });
}

export function setStaffInventoryOnHand(input) {
  return staffRequest("/api/inventory/set-on-hand", {
    method: "POST",
    body: input
  });
}

export function createStaffDraftOrder(input) {
  return staffRequest("/api/orders/draft", {
    method: "POST",
    body: input
  });
}

export function listStaffOrders(status) {
  const params = new URLSearchParams(status ? { status } : {});
  return staffRequest(`/api/orders${params.toString() ? `?${params.toString()}` : ""}`);
}

export function sendStaffInvoice(orderId) {
  return staffRequest(`/api/orders/${encodeURIComponent(orderId)}/send-invoice`, {
    method: "POST",
    body: {}
  });
}

export function completeStaffOrder(orderId, paymentPending = false) {
  return staffRequest(`/api/orders/${encodeURIComponent(orderId)}/complete`, {
    method: "POST",
    body: { paymentPending }
  });
}

export function listStaffAudit(limit = 100) {
  const params = new URLSearchParams({ limit: String(limit) });
  return staffRequest(`/api/audit?${params.toString()}`);
}
