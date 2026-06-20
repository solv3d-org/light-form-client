import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router";
import {
  archiveStaffProduct,
  completeStaffOrder,
  createStaffUser,
  createStaffDraftOrder,
  getStaffOrder,
  getStaffToken,
  getStaffMe,
  getStorefrontCuration,
  listStaffAudit,
  listStaffPermissionConfig,
  listStaffUsers,
  listStaffOrders,
  saveStaffToken,
  searchStaffInventory,
  sendStaffInvoice,
  saveStorefrontCuration,
  setStaffInventoryOnHand,
  staffLogin,
  updateStaffProduct,
  updateStaffUser
} from "../lib/staffApi";

const STAFF_ROLES = ["admin", "pm", "staff"];
const EMPTY_PERMISSION_OVERRIDES = { allow: [], deny: [] };
const FALLBACK_PERMISSION_CONFIG = { roles: STAFF_ROLES, permissions: [], rolePermissions: {} };
const STAFF_TABS = [
  { id: "orders", permissions: ["order:read"] },
  { id: "checkout", permissions: ["inventory:read", "order:create"] },
  { id: "storefront-curation", permissions: ["storefront:curate"] },
  { id: "staff-activity", permissions: ["audit:read"] },
  { id: "access-management", permissions: ["user:manage"] }
];

const EMPTY_ADDRESS = {
  firstName: "",
  lastName: "",
  address1: "",
  address2: "",
  city: "Singapore",
  country: "Singapore",
  zip: "",
  phone: ""
};

const EMPTY_INTERNAL = {
  supplier: "",
  stockroomBin: "",
  opsNotes: "",
  approvalRequired: false,
  paymentMethod: "cash",
  customPaymentMethod: "",
  splitPayment: false,
  amountCollected: "",
  balanceDue: "",
  balanceCollectionDate: "",
  balanceNotes: "",
  costPrice: "",
  grossMargin: ""
};

const PAYMENT_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "paynow", label: "PayNow" },
  { value: "paylah", label: "PayLah" },
  { value: "paywave", label: "PayWave" },
  { value: "card", label: "Card" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "custom", label: "Custom" }
];

function moneyLabel(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "";
  return new Intl.NumberFormat("en-SG", { style: "currency", currency: "SGD" }).format(amount);
}

function toMoneyNumber(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

function readReceiptFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ name: file.name, type: file.type, size: file.size, dataUrl: reader.result });
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function lineDiscount(item) {
  const price = toMoneyNumber(item.price);
  const unitPrice = item.unitPrice === "" ? price : toMoneyNumber(item.unitPrice);
  const baseDiscount = Math.max(0, price - unitPrice);
  const manualValue = toMoneyNumber(item.discountValue);
  const manualDiscount = item.discountType === "percentage" ? unitPrice * (manualValue / 100) : manualValue;
  return Math.min(price, baseDiscount + Math.max(0, manualDiscount));
}

function lineTotal(item) {
  const price = toMoneyNumber(item.price);
  return Math.max(0, price - lineDiscount(item)) * item.quantity;
}

function hasStaffPermission(staff, permission) {
  return (staff?.effectivePermissions || []).includes(permission);
}

function roleHasPermission(permissionConfig, role, permission) {
  return (permissionConfig.rolePermissions?.[role] || []).includes(permission);
}

function normalizeOverrides(overrides = EMPTY_PERMISSION_OVERRIDES) {
  return {
    allow: Array.isArray(overrides.allow) ? overrides.allow : [],
    deny: Array.isArray(overrides.deny) ? overrides.deny : []
  };
}

function hasDraftPermission(draft, permissionConfig, permission) {
  const overrides = normalizeOverrides(draft.permissionOverrides);
  if (overrides.deny.includes(permission)) return false;
  if (overrides.allow.includes(permission)) return true;
  return roleHasPermission(permissionConfig, draft.role, permission);
}

function toggleDraftPermission(draft, permissionConfig, permission) {
  const overrides = normalizeOverrides(draft.permissionOverrides);
  const allow = overrides.allow.filter((item) => item !== permission);
  const deny = overrides.deny.filter((item) => item !== permission);
  const nextChecked = !hasDraftPermission(draft, permissionConfig, permission);
  const baseChecked = roleHasPermission(permissionConfig, draft.role, permission);
  if (nextChecked !== baseChecked) {
    (nextChecked ? allow : deny).push(permission);
  }
  return {
    ...draft,
    permissionOverrides: {
      allow: [...new Set(allow)].sort(),
      deny: [...new Set(deny)].sort()
    }
  };
}

function LoginPanel({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");

  const handleSubmit = async (event) => {
    event.preventDefault();
    setStatus("loading");
    setError("");

    try {
      const payload = await staffLogin(email, password);
      saveStaffToken(payload.token);
      onLogin(payload.staff);
    } catch (nextError) {
      setError(nextError.message);
    } finally {
      setStatus("idle");
    }
  };

  return (
    <main className="staff-page">
      <section className="staff-login-shell">
        <form className="staff-panel staff-login" onSubmit={handleSubmit}>
          <p className="section-kicker">Staff IMS</p>
          <h1>Sign in</h1>
          <label>
            Email
            <input type="email" value={email} autoComplete="username" onChange={(event) => setEmail(event.target.value)} required />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              autoComplete="current-password"
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          {error && <p className="staff-error">{error}</p>}
          <button className="button-primary" type="submit" disabled={status === "loading"}>
            {status === "loading" ? "Signing in" : "Sign in"}
          </button>
        </form>
      </section>
    </main>
  );
}

function StaffHeaderSession({ staff, onLogout }) {
  const [target, setTarget] = useState(null);

  useEffect(() => {
    setTarget(document.getElementById("staff-header-session"));
  }, []);

  if (!target) return null;
  return createPortal(
    <div className="staff-session">
      <span>{staff.name || staff.email}</span>
      <strong>{staff.role}</strong>
      <button className="button-secondary" type="button" onClick={onLogout}>
        Log out
      </button>
    </div>,
    target
  );
}

function PermissionGrid({ draft, permissionConfig, onChange }) {
  if (!permissionConfig.permissions.length) return null;
  return (
    <div className="staff-permission-grid">
      {permissionConfig.permissions.map((permission) => (
        <label className="staff-checkbox" key={permission.key}>
          <input
            type="checkbox"
            checked={hasDraftPermission(draft, permissionConfig, permission.key)}
            onChange={() => onChange(toggleDraftPermission(draft, permissionConfig, permission.key))}
          />
          {permission.label}
        </label>
      ))}
    </div>
  );
}

function StaffUserRow({ user, permissionConfig, status, onSave, onToggleActive }) {
  const [draft, setDraft] = useState(() => ({
    name: user.name || "",
    role: user.role,
    password: "",
    permissionOverrides: normalizeOverrides(user.permissionOverrides)
  }));

  useEffect(() => {
    setDraft({
      name: user.name || "",
      role: user.role,
      password: "",
      permissionOverrides: normalizeOverrides(user.permissionOverrides)
    });
  }, [user]);

  const setDraftValue = (key, value) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const handleRoleChange = (role) => {
    setDraft((current) => ({ ...current, role, permissionOverrides: EMPTY_PERMISSION_OVERRIDES }));
  };

  const handleSave = async (event) => {
    event.preventDefault();
    await onSave(user, {
      name: draft.name,
      role: draft.role,
      permissionOverrides: draft.permissionOverrides,
      ...(draft.password ? { password: draft.password } : {})
    });
    setDraft((current) => ({ ...current, password: "" }));
  };

  return (
    <article className="staff-user-row staff-user-editor">
      <form onSubmit={handleSave}>
        <div className="staff-user-summary">
          <strong>{user.email}</strong>
          <span>{user.active ? "active" : "disabled"} · {user.effectivePermissions?.length || 0} permissions</span>
        </div>
        <div className="staff-user-controls">
          <input value={draft.name} aria-label="Staff name" onChange={(event) => setDraftValue("name", event.target.value)} />
          <select value={draft.role} aria-label="Staff role" onChange={(event) => handleRoleChange(event.target.value)}>
            {permissionConfig.roles.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
          <input
            type="password"
            value={draft.password}
            placeholder="Reset password"
            aria-label="Reset password"
            autoComplete="new-password"
            onChange={(event) => setDraftValue("password", event.target.value)}
          />
        </div>
        <PermissionGrid draft={draft} permissionConfig={permissionConfig} onChange={setDraft} />
        <div className="staff-order-actions">
          <button className="button-inline" type="submit" disabled={status === "saving"}>
            Save
          </button>
          <button className="button-inline" type="button" disabled={status === "saving"} onClick={() => onToggleActive(user)}>
            {user.active ? "Disable" : "Enable"}
          </button>
        </div>
      </form>
    </article>
  );
}

function StaffUsersPanel() {
  const [users, setUsers] = useState([]);
  const [permissionConfig, setPermissionConfig] = useState(FALLBACK_PERMISSION_CONFIG);
  const [form, setForm] = useState({ email: "", name: "", role: "staff", password: "" });
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");

  const loadUsers = async () => {
    setStatus("loading");
    setError("");

    try {
      const [usersPayload, permissionsPayload] = await Promise.all([listStaffUsers(), listStaffPermissionConfig()]);
      setUsers(usersPayload.users || []);
      setPermissionConfig({
        roles: permissionsPayload.roles || STAFF_ROLES,
        permissions: permissionsPayload.permissions || [],
        rolePermissions: permissionsPayload.rolePermissions || {}
      });
    } catch (nextError) {
      setError(nextError.message);
    } finally {
      setStatus("idle");
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const setFormValue = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const handleCreateUser = async (event) => {
    event.preventDefault();
    setStatus("saving");
    setError("");

    try {
      await createStaffUser(form);
      setForm({ email: "", name: "", role: "staff", password: "" });
      await loadUsers();
    } catch (nextError) {
      setError(nextError.message);
      setStatus("idle");
    }
  };

  const handleSaveUser = async (user, input) => {
    setStatus("saving");
    setError("");

    try {
      await updateStaffUser(user.id, input);
      await loadUsers();
    } catch (nextError) {
      setError(nextError.message);
      setStatus("idle");
    }
  };

  const handleToggleActive = async (user) => {
    setStatus("saving");
    setError("");

    try {
      await updateStaffUser(user.id, { active: !user.active });
      await loadUsers();
    } catch (nextError) {
      setError(nextError.message);
      setStatus("idle");
    }
  };

  return (
    <section className="staff-panel staff-users">
      <div className="staff-panel-head">
        <div>
          <p className="section-kicker">Access</p>
          <h2>Staff users</h2>
        </div>
      </div>
      <form className="staff-user-form" onSubmit={handleCreateUser}>
        <input
          type="email"
          value={form.email}
          placeholder="Email"
          aria-label="Staff email"
          autoComplete="username"
          onChange={(event) => setFormValue("email", event.target.value)}
          required
        />
        <input
          value={form.name}
          placeholder="Name"
          aria-label="Staff name"
          autoComplete="name"
          onChange={(event) => setFormValue("name", event.target.value)}
        />
        <select value={form.role} aria-label="Staff role" onChange={(event) => setFormValue("role", event.target.value)}>
          {permissionConfig.roles.map((role) => (
            <option key={role} value={role}>
              {role}
            </option>
          ))}
        </select>
        <input
          type="password"
          value={form.password}
          placeholder="Initial password"
          aria-label="Initial password"
          autoComplete="new-password"
          onChange={(event) => setFormValue("password", event.target.value)}
          required
        />
        <button className="button-secondary" type="submit" disabled={status === "saving"}>
          Create
        </button>
      </form>
      {error && <p className="staff-error">{error}</p>}
      <div className="staff-user-list">
        {users.map((user) => (
          <StaffUserRow
            key={user.id}
            user={user}
            permissionConfig={permissionConfig}
            status={status}
            onSave={handleSaveUser}
            onToggleActive={handleToggleActive}
          />
        ))}
      </div>
    </section>
  );
}

function StaffField({ label, children }) {
  return (
    <label>
      {label}
      {children}
    </label>
  );
}

function productDraftFromVariant(variant) {
  const product = variant.catalogProduct || {};
  return {
    id: product.id || variant.product?.id || variant.id,
    title: product.title || variant.product?.title || variant.title || "",
    handle: product.handle || variant.product?.handle || "",
    vendor: product.vendor || variant.product?.vendor || "",
    productType: product.productType || variant.product?.productType || "",
    sku: product.sku || variant.sku || "",
    price: product.price || variant.price || "",
    onHand: String(product.inventory?.onHand ?? variant.inventory?.onHand ?? 0),
    variantId: product.shopifyVariantId || variant.id,
    inventoryItemId: product.inventoryItemId || variant.inventory?.inventoryItemId || ""
  };
}

function metadataRows(variant) {
  const product = variant.product || {};
  return [
    ["Product title", product.title],
    ["Variant title", variant.title],
    ["Handle", product.handle],
    ["SKU", variant.sku],
    ["Barcode", variant.barcode],
    ["Vendor", product.vendor],
    ["Product type", product.productType],
    ["Status", product.status],
    ["Price", variant.price],
    ["Compare at", variant.compareAtPrice],
    ["Product ID", product.id],
    ["Variant ID", variant.id],
    ["Numeric variant ID", variant.numericId],
    ["Inventory item ID", variant.inventory?.inventoryItemId],
    ["Inventory tracked", variant.inventory?.tracked ? "yes" : "no"],
    ["Available", variant.inventory?.available],
    ["On hand", variant.inventory?.onHand]
  ].filter(([, value]) => value !== undefined && value !== null && value !== "");
}

function InventoryDetailPanel({ variant, onClose }) {
  const levels = variant.inventory?.levels || [];

  return (
    <section className="staff-detail-panel">
      <div className="staff-panel-head">
        <div>
          <p className="section-kicker">Product detail</p>
          <h2>{variant.product?.title || variant.title || "Stock item"}</h2>
        </div>
        <button className="button-inline" type="button" onClick={onClose}>
          Close
        </button>
      </div>
      <dl className="staff-detail-grid">
        {metadataRows(variant).map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{String(value)}</dd>
          </div>
        ))}
      </dl>
      {levels.length > 0 && (
        <div className="staff-detail-locations">
          <p className="section-kicker">Locations</p>
          {levels.map((level) => {
            const available = level.quantities?.find((quantity) => quantity.name === "available")?.quantity ?? 0;
            const onHand = level.quantities?.find((quantity) => quantity.name === "on_hand")?.quantity ?? 0;
            return (
              <article key={level.locationId || level.locationName}>
                <strong>{level.locationName || level.locationId}</strong>
                <span>Available {available} · On hand {onHand}</span>
                {level.locationId && <small>{level.locationId}</small>}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function InventorySearch({ canAdd, canManage, onAdd }) {
  const [query, setQuery] = useState("");
  const [variants, setVariants] = useState([]);
  const [editing, setEditing] = useState(null);
  const [detailVariant, setDetailVariant] = useState(null);
  const [stockDrafts, setStockDrafts] = useState({});
  const [selectedVariantIds, setSelectedVariantIds] = useState([]);
  const [bulkOnHand, setBulkOnHand] = useState("");
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const selectedVariants = variants.filter((variant) => selectedVariantIds.includes(variant.id));
  const allVisibleSelected = variants.length > 0 && selectedVariants.length === variants.length;

  const loadSearch = async (searchQuery = query) => {
    setStatus("loading");
    setError("");

    try {
      const payload = await searchStaffInventory(searchQuery);
      setVariants(payload.variants || []);
    } catch (nextError) {
      setError(nextError.message);
    } finally {
      setStatus("idle");
    }
  };

  useEffect(() => {
    let canceled = false;
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setStatus("loading");
      setError("");
      try {
        const payload = await searchStaffInventory(query, { signal: controller.signal });
        if (!canceled) setVariants(payload.variants || []);
      } catch (nextError) {
        if (!canceled && nextError.name !== "AbortError") setError(nextError.message);
      } finally {
        if (!canceled) setStatus("idle");
      }
    }, 250);
    return () => {
      canceled = true;
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [query]);

  const handleSearch = async (event) => {
    event.preventDefault();
    await loadSearch();
  };

  const setEditingValue = (key, value) => {
    setEditing((current) => ({ ...current, [key]: value }));
  };

  const toggleSelected = (variantId) => {
    setSelectedVariantIds((current) =>
      current.includes(variantId) ? current.filter((id) => id !== variantId) : [...current, variantId]
    );
  };

  const toggleAllVisible = () => {
    setSelectedVariantIds(allVisibleSelected ? [] : variants.map((variant) => variant.id));
  };

  const handleSaveProduct = async (event) => {
    event.preventDefault();
    if (!editing) return;
    setStatus("saving");
    setError("");
    try {
      await updateStaffProduct(editing.id, {
        title: editing.title,
        handle: editing.handle,
        vendor: editing.vendor,
        productType: editing.productType,
        sku: editing.sku,
        price: editing.price,
        onHand: editing.onHand,
        variantId: editing.variantId,
        inventoryItemId: editing.inventoryItemId
      });
      setEditing(null);
      await loadSearch();
    } catch (nextError) {
      setError(nextError.message);
      setStatus("idle");
    }
  };

  const handleArchiveProduct = async (variant) => {
    if (!window.confirm("Archive this product in the current catalog source?")) return;
    setStatus("saving");
    setError("");
    try {
      await archiveStaffProduct(productDraftFromVariant(variant).id);
      await loadSearch();
    } catch (nextError) {
      setError(nextError.message);
      setStatus("idle");
    }
  };

  const handleSetOnHand = async (event, variant) => {
    event.preventDefault();
    const draft = productDraftFromVariant(variant);
    setStatus("saving");
    setError("");
    try {
      await setStaffInventoryOnHand({
        id: draft.id,
        sku: draft.sku,
        variantId: draft.variantId,
        inventoryItemId: draft.inventoryItemId,
        onHand: stockDrafts[variant.id] ?? draft.onHand
      });
      await loadSearch();
    } catch (nextError) {
      setError(nextError.message);
      setStatus("idle");
    }
  };

  const handleBulkAdd = () => {
    selectedVariants.forEach((variant) => onAdd(variant));
  };

  const handleBulkSetOnHand = async (event) => {
    event.preventDefault();
    const quantity = Number(bulkOnHand);
    if (!selectedVariants.length) return;
    if (!Number.isInteger(quantity) || quantity < 0) {
      setError("Bulk stock must be a non-negative integer.");
      return;
    }

    setStatus("saving");
    setError("");
    try {
      await Promise.all(
        selectedVariants.map((variant) => {
          const draft = productDraftFromVariant(variant);
          return setStaffInventoryOnHand({
            id: draft.id,
            sku: draft.sku,
            variantId: draft.variantId,
            inventoryItemId: draft.inventoryItemId,
            onHand: bulkOnHand
          });
        })
      );
      setBulkOnHand("");
      await loadSearch();
    } catch (nextError) {
      setError(nextError.message);
      setStatus("idle");
    }
  };

  const handleBulkArchive = async () => {
    if (!selectedVariants.length) return;
    if (!window.confirm(`Archive ${selectedVariants.length} selected products?`)) return;
    setStatus("saving");
    setError("");
    try {
      await Promise.all(selectedVariants.map((variant) => archiveStaffProduct(productDraftFromVariant(variant).id)));
      setSelectedVariantIds([]);
      await loadSearch();
    } catch (nextError) {
      setError(nextError.message);
      setStatus("idle");
    }
  };

  return (
    <section className="staff-panel staff-inventory">
      <div className="staff-panel-head">
        <div>
          <p className="section-kicker">Inventory</p>
          <h2>Admin products</h2>
        </div>
      </div>
      <form className="staff-search" onSubmit={handleSearch}>
        <input value={query} placeholder="Search SKU, title, barcode" onChange={(event) => setQuery(event.target.value)} />
        <span className="staff-search-status">{status === "loading" ? "Searching" : "Live"}</span>
      </form>
      {error && <p className="staff-error">{error}</p>}
      {variants.length > 0 && (
        <div className="staff-bulk-actions">
          <label className="staff-checkbox">
            <input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} />
            {selectedVariants.length ? `${selectedVariants.length} selected` : "Select all"}
          </label>
          {canAdd && (
            <button className="button-inline" type="button" disabled={!selectedVariants.length} onClick={handleBulkAdd}>
              Add selected
            </button>
          )}
          {canManage && (
            <form className="staff-bulk-stock-form" onSubmit={handleBulkSetOnHand}>
              <input
                type="number"
                min="0"
                value={bulkOnHand}
                placeholder="On hand"
                aria-label="Bulk on hand"
                onChange={(event) => setBulkOnHand(event.target.value)}
              />
              <button className="button-inline" type="submit" disabled={!selectedVariants.length || status === "saving"}>
                Set stock
              </button>
              <button className="button-inline" type="button" disabled={!selectedVariants.length || status === "saving"} onClick={handleBulkArchive}>
                Archive selected
              </button>
            </form>
          )}
        </div>
      )}
      <div className="staff-result-list">
        {variants.map((variant) => {
          const draft = productDraftFromVariant(variant);
          const stockValue = stockDrafts[variant.id] ?? draft.onHand;
          return (
            <article className="staff-result" key={variant.id}>
              <label className="staff-result-select">
                <input type="checkbox" checked={selectedVariantIds.includes(variant.id)} onChange={() => toggleSelected(variant.id)} />
              </label>
              <button className="staff-result-summary" type="button" onClick={() => setDetailVariant(variant)}>
                <strong>{variant.product?.title || "Product"}</strong>
                <span>{variant.title === "Default Title" ? variant.sku || "Default" : variant.title}</span>
                <small>
                  {variant.sku || "No SKU"} · Available {variant.inventory?.available ?? 0} · {moneyLabel(variant.price)}
                </small>
              </button>
              <div className="staff-result-actions">
                {canAdd && (
                  <button className="button-inline" type="button" onClick={() => onAdd(variant)}>
                    Add
                  </button>
                )}
                {canManage && (
                  <>
                    <form className="staff-stock-form" onSubmit={(event) => handleSetOnHand(event, variant)}>
                      <input
                        type="number"
                        min="0"
                        value={stockValue}
                        aria-label="On hand"
                        onChange={(event) => setStockDrafts((current) => ({ ...current, [variant.id]: event.target.value }))}
                      />
                      <button className="button-inline" type="submit" disabled={status === "saving"}>
                        Set stock
                      </button>
                    </form>
                    <button className="button-inline" type="button" disabled={status === "saving"} onClick={() => setEditing(draft)}>
                      Edit
                    </button>
                    <button className="button-inline" type="button" disabled={status === "saving"} onClick={() => handleArchiveProduct(variant)}>
                      Archive
                    </button>
                  </>
                )}
              </div>
            </article>
          );
        })}
      </div>
      {detailVariant && <InventoryDetailPanel variant={detailVariant} onClose={() => setDetailVariant(null)} />}
      {editing && (
        <form className="staff-product-edit" onSubmit={handleSaveProduct}>
          <StaffField label="Title">
            <input value={editing.title} onChange={(event) => setEditingValue("title", event.target.value)} required />
          </StaffField>
          <StaffField label="Handle">
            <input value={editing.handle} onChange={(event) => setEditingValue("handle", event.target.value)} />
          </StaffField>
          <StaffField label="SKU">
            <input value={editing.sku} onChange={(event) => setEditingValue("sku", event.target.value)} />
          </StaffField>
          <StaffField label="Vendor">
            <input value={editing.vendor} onChange={(event) => setEditingValue("vendor", event.target.value)} />
          </StaffField>
          <StaffField label="Type">
            <input value={editing.productType} onChange={(event) => setEditingValue("productType", event.target.value)} />
          </StaffField>
          <StaffField label="Price">
            <input value={editing.price} onChange={(event) => setEditingValue("price", event.target.value)} />
          </StaffField>
          <StaffField label="On hand">
            <input type="number" min="0" value={editing.onHand} onChange={(event) => setEditingValue("onHand", event.target.value)} />
          </StaffField>
          <button className="button-secondary" type="submit" disabled={status === "saving"}>
            Save product
          </button>
          <button className="button-inline" type="button" onClick={() => setEditing(null)}>
            Cancel
          </button>
        </form>
      )}
    </section>
  );
}

function productCurationItem(variant) {
  return {
    productId: variant.product?.id || "",
    handle: variant.product?.handle || "",
    title: variant.product?.title || variant.title || "Product",
    sku: variant.sku || "",
    imageUrl: variant.image?.url || ""
  };
}

function CurationCard({ title, emptyText, items, onAdd, onMove, onRemove }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searchStatus, setSearchStatus] = useState("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    let canceled = false;
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      if (!query.trim()) {
        setResults([]);
        return;
      }
      setSearchStatus("searching");
      setError("");
      try {
        const payload = await searchStaffInventory(query, { signal: controller.signal });
        if (!canceled) setResults(payload.variants || []);
      } catch (nextError) {
        if (!canceled && nextError.name !== "AbortError") setError(nextError.message);
      } finally {
        if (!canceled) setSearchStatus("idle");
      }
    }, 250);
    return () => {
      canceled = true;
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [query]);

  return (
    <section className="staff-curation-card">
      <div className="staff-panel-head">
        <div>
          <p className="section-kicker">Storefront</p>
          <h3>{title}</h3>
        </div>
        <span className="staff-search-status">{searchStatus === "searching" ? "Searching" : `${items.length} shown`}</span>
      </div>
      <form className="staff-search" onSubmit={(event) => event.preventDefault()}>
        <input value={query} placeholder="Search Shopify products" onChange={(event) => setQuery(event.target.value)} />
      </form>
      {error && <p className="staff-error">{error}</p>}
      {results.length > 0 && (
        <div className="staff-result-list staff-curation-results">
          {results.map((variant) => {
            const item = productCurationItem(variant);
            const selected = items.some((current) => current.productId === item.productId);
            return (
              <article className="staff-result" key={variant.id}>
                <button className="staff-result-summary" type="button" onClick={() => onAdd(variant)}>
                  <strong>{item.title}</strong>
                  <span>{variant.title === "Default Title" ? item.sku || "Default" : variant.title}</span>
                  <small>{item.sku || "No SKU"} · {moneyLabel(variant.price)}</small>
                </button>
                <div className="staff-result-actions">
                  <button className="button-inline" type="button" disabled={selected} onClick={() => onAdd(variant)}>
                    {selected ? "Added" : "Show"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
      <div className="staff-curation-list">
        {items.map((item, index) => (
          <article className="staff-order" key={item.productId}>
            <div className="staff-order-summary">
              <strong>{String(index + 1).padStart(2, "0")} · {item.title}</strong>
              <span>{item.sku || item.handle || item.productId}</span>
            </div>
            <div className="staff-order-actions">
              <button className="button-inline" type="button" disabled={index === 0} onClick={() => onMove(index, -1)}>
                Up
              </button>
              <button className="button-inline" type="button" disabled={index === items.length - 1} onClick={() => onMove(index, 1)}>
                Down
              </button>
              <button className="button-inline" type="button" onClick={() => onRemove(item.productId)}>
                Remove
              </button>
            </div>
          </article>
        ))}
      </div>
      {!items.length && <p className="staff-muted">{emptyText}</p>}
    </section>
  );
}

function StorefrontCurationPanel() {
  const [homeItems, setHomeItems] = useState([]);
  const [shopItems, setShopItems] = useState([]);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");

  const loadCuration = async () => {
    setStatus("loading");
    setError("");
    try {
      const payload = await getStorefrontCuration();
      setHomeItems(payload.curation?.homeItems || payload.curation?.items || []);
      setShopItems(payload.curation?.shopItems || payload.curation?.items || []);
    } catch (nextError) {
      setError(nextError.message);
    } finally {
      setStatus("idle");
    }
  };

  useEffect(() => {
    loadCuration();
  }, []);

  const persistCuration = async (nextHomeItems, nextShopItems) => {
    setStatus("saving");
    setError("");
    try {
      const payload = await saveStorefrontCuration({ homeItems: nextHomeItems, shopItems: nextShopItems });
      setHomeItems(payload.curation?.homeItems || []);
      setShopItems(payload.curation?.shopItems || []);
    } catch (nextError) {
      setError(nextError.message);
    } finally {
      setStatus("idle");
    }
  };

  const updateItems = (kind, updater) => {
    const nextHomeItems = kind === "home" ? updater(homeItems) : homeItems;
    const nextShopItems = kind === "shop" ? updater(shopItems) : shopItems;
    setHomeItems(nextHomeItems);
    setShopItems(nextShopItems);
    persistCuration(nextHomeItems, nextShopItems);
  };

  const addItem = (kind, variant) => {
    const item = productCurationItem(variant);
    if (!item.productId) return;
    updateItems(kind, (current) => (current.some((existing) => existing.productId === item.productId) ? current : [...current, item]));
  };

  const moveItem = (kind, index, direction) => {
    updateItems(kind, (current) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  };

  const removeItem = (kind, productId) => {
    updateItems(kind, (current) => current.filter((item) => item.productId !== productId));
  };

  return (
    <section className="staff-panel staff-curation">
      <div className="staff-panel-head">
        <div>
          <p className="section-kicker">Storefront</p>
          <h2>Client catalog curation</h2>
        </div>
        <span className="staff-search-status">{status === "saving" ? "Saving" : status === "loading" ? "Loading" : "Saved"}</span>
      </div>
      {error && <p className="staff-error">{error}</p>}
      <div className="staff-curation-grid">
        <CurationCard
          title="Home carousel"
          emptyText="No carousel products selected. The home carousel will use the default Shopify catalog."
          items={homeItems}
          onAdd={(variant) => addItem("home", variant)}
          onMove={(index, direction) => moveItem("home", index, direction)}
          onRemove={(productId) => removeItem("home", productId)}
        />
        <CurationCard
          title="Shop grid"
          emptyText="No shop products selected. The shop page will use the default Shopify catalog."
          items={shopItems}
          onAdd={(variant) => addItem("shop", variant)}
          onMove={(index, direction) => moveItem("shop", index, direction)}
          onRemove={(productId) => removeItem("shop", productId)}
        />
      </div>
    </section>
  );
}

function StaffCart({ staff, cart, isOpen, onClose, onQuantity, onRemove, onItemChange, onDraftCreated }) {
  const [email, setEmail] = useState("");
  const [fulfillment, setFulfillment] = useState({ type: "pickup", deliveryDate: "", dateTba: false });
  const [shippingAddress, setShippingAddress] = useState(EMPTY_ADDRESS);
  const [internal, setInternal] = useState(EMPTY_INTERNAL);
  const [receiptFiles, setReceiptFiles] = useState([]);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const canWriteCost = hasStaffPermission(staff, "cost:write");
  const canApplyDiscount = hasStaffPermission(staff, "discount:apply");
  const canOverridePrice = hasStaffPermission(staff, "price:override");
  const canDescribeLine = hasStaffPermission(staff, "line:describe");

  const total = useMemo(
    () => cart.reduce((sum, item) => sum + lineTotal(item), 0),
    [cart]
  );

  const setAddressValue = (key, value) => {
    setShippingAddress((current) => ({ ...current, [key]: value }));
  };

  const setInternalValue = (key, value) => {
    setInternal((current) => ({ ...current, [key]: value }));
  };

  const handleCreateDraft = async (event) => {
    event.preventDefault();
    setStatus("loading");
    setError("");

    try {
      const invalidOverride = cart.find((item) => item.unitPrice !== "" && toMoneyNumber(item.unitPrice) > toMoneyNumber(item.price));
      if (invalidOverride) throw new Error("Unit price cannot exceed catalog price.");
      const amountCollected = internal.splitPayment ? toMoneyNumber(internal.amountCollected) : total;
      const balanceDue = internal.splitPayment ? Math.max(0, total - amountCollected) : 0;
      if (internal.paymentMethod === "custom" && !internal.customPaymentMethod.trim()) throw new Error("Custom payment method required.");
      if (internal.splitPayment && amountCollected <= 0) throw new Error("Amount collected is required for split payments.");
      if (internal.splitPayment && amountCollected >= total) throw new Error("Split payment amount must be less than subtotal.");
      if (internal.splitPayment && !internal.balanceCollectionDate) throw new Error("Next collection date required for split payments.");
      const paymentEvidence = await Promise.all(receiptFiles.map(readReceiptFile));
      const payload = await createStaffDraftOrder({
        email,
        lineItems: cart.map((item) => {
          const discountAmount = lineDiscount(item);
          const price = toMoneyNumber(item.price);
          const unitPrice = item.unitPrice === "" ? price : toMoneyNumber(item.unitPrice);
          const finalUnitPrice = Math.max(0, price - discountAmount);
          const hasPriceOverride = item.unitPrice !== "" && unitPrice !== price;
          return {
            variantId: item.variantId,
            title: item.title,
            sku: item.sku,
            price: item.price,
            quantity: item.quantity,
            description: item.description,
            ...(hasPriceOverride ? { priceOverride: finalUnitPrice } : {}),
            ...(!hasPriceOverride && discountAmount > 0
              ? { appliedDiscount: { valueType: "fixed_amount", value: discountAmount, title: "In-store adjustment", description: "Staff cart adjustment" } }
              : {})
          };
        }),
        fulfillment,
        shippingAddress: fulfillment.type === "delivery" ? shippingAddress : undefined,
        internal: {
          supplier: internal.supplier,
          stockroomBin: internal.stockroomBin,
          opsNotes: internal.opsNotes,
          approvalRequired: internal.approvalRequired,
          payment: {
            method: internal.paymentMethod,
            customMethod: internal.paymentMethod === "custom" ? internal.customPaymentMethod : "",
            split: internal.splitPayment,
            amountCollected: amountCollected.toFixed(2),
            balanceDue: balanceDue.toFixed(2),
            balanceCollectionDate: internal.splitPayment ? internal.balanceCollectionDate : "",
            balanceNotes: internal.splitPayment ? internal.balanceNotes : ""
          },
          paymentEvidence,
          ...(canWriteCost ? { costPrice: internal.costPrice, grossMargin: internal.grossMargin } : {})
        }
      });
      setEmail("");
      setFulfillment({ type: "pickup", deliveryDate: "", dateTba: false });
      setShippingAddress(EMPTY_ADDRESS);
      setInternal(EMPTY_INTERNAL);
      setReceiptFiles([]);
      onDraftCreated(payload.order);
    } catch (nextError) {
      setError(nextError.message);
    } finally {
      setStatus("idle");
    }
  };

  if (!isOpen) return null;

  return (
    <div className="cart-layer" role="presentation">
      <button className="cart-backdrop" type="button" aria-label="Close cart" onClick={onClose}></button>
      <aside className="cart-drawer staff-cart-panel" aria-label="Staff cart">
      <div className="cart-head">
        <div>
          <p className="section-kicker">Cart</p>
          <h2>Selected pieces</h2>
        </div>
        <button className="cart-close" type="button" aria-label="Close cart" onClick={onClose}>
          ×
        </button>
      </div>

      <form className="staff-cart-form" onSubmit={handleCreateDraft}>
        <StaffField label="Customer email">
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </StaffField>

        <div className="staff-cart-lines">
          {cart.length === 0 ? (
            <p className="staff-muted">No products selected.</p>
          ) : (
            cart.map((item) => (
              <article className="staff-cart-line" key={item.variantId}>
                <div className="staff-cart-main">
                  <strong>{item.title}</strong>
                  <span>{item.sku || "No SKU"} · {moneyLabel(item.price)} · line {moneyLabel(lineTotal(item))}</span>
                  <div className="staff-line-controls">
                    {canOverridePrice && (
                      <StaffField label="Unit price">
                        <input
                          type="number"
                          min="0"
                          max={item.price}
                          step="0.01"
                          value={item.unitPrice}
                          onChange={(event) => onItemChange(item.variantId, { unitPrice: event.target.value })}
                        />
                      </StaffField>
                    )}
                    {canApplyDiscount && (
                      <>
                        <StaffField label="Discount type">
                          <select value={item.discountType} onChange={(event) => onItemChange(item.variantId, { discountType: event.target.value })}>
                            <option value="fixed_amount">Fixed</option>
                            <option value="percentage">Percent</option>
                          </select>
                        </StaffField>
                        <StaffField label="Discount">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.discountValue}
                            onChange={(event) => onItemChange(item.variantId, { discountValue: event.target.value })}
                          />
                        </StaffField>
                      </>
                    )}
                    {canDescribeLine && (
                      <StaffField label="Line description">
                        <textarea value={item.description} onChange={(event) => onItemChange(item.variantId, { description: event.target.value })} />
                      </StaffField>
                    )}
                  </div>
                </div>
                <div className="staff-qty">
                  <button type="button" onClick={() => onQuantity(item.variantId, item.quantity - 1)}>-</button>
                  <span>{item.quantity}</span>
                  <button type="button" onClick={() => onQuantity(item.variantId, item.quantity + 1)}>+</button>
                  <button type="button" onClick={() => onRemove(item.variantId)}>Remove</button>
                </div>
              </article>
            ))
          )}
        </div>

        <div className="staff-segmented">
          <button
            type="button"
            className={fulfillment.type === "pickup" ? "is-active" : ""}
            onClick={() => setFulfillment((current) => ({ ...current, type: "pickup" }))}
          >
            Pickup
          </button>
          <button
            type="button"
            className={fulfillment.type === "delivery" ? "is-active" : ""}
            onClick={() => setFulfillment((current) => ({ ...current, type: "delivery" }))}
          >
            Delivery
          </button>
        </div>

        {fulfillment.type === "delivery" && (
          <div className="staff-field-grid">
            <StaffField label="Delivery date">
              <input
                type="date"
                value={fulfillment.deliveryDate}
                disabled={fulfillment.dateTba}
                required={!fulfillment.dateTba}
                onChange={(event) => setFulfillment((current) => ({ ...current, deliveryDate: event.target.value }))}
              />
            </StaffField>
            <label className="staff-checkbox">
              <input
                type="checkbox"
                checked={fulfillment.dateTba}
                onChange={(event) => setFulfillment((current) => ({ ...current, dateTba: event.target.checked }))}
              />
              Date TBA
            </label>
            {Object.keys(EMPTY_ADDRESS).map((key) => (
              <StaffField key={key} label={key.replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`)}>
                <input value={shippingAddress[key]} onChange={(event) => setAddressValue(key, event.target.value)} />
              </StaffField>
            ))}
          </div>
        )}

        <div className="staff-field-grid">
          <StaffField label="Supplier">
            <input value={internal.supplier} onChange={(event) => setInternalValue("supplier", event.target.value)} />
          </StaffField>
          <StaffField label="Stockroom bin">
            <input value={internal.stockroomBin} onChange={(event) => setInternalValue("stockroomBin", event.target.value)} />
          </StaffField>
          <StaffField label="Payment method">
            <select value={internal.paymentMethod} onChange={(event) => setInternalValue("paymentMethod", event.target.value)}>
              {PAYMENT_METHODS.map((method) => (
                <option key={method.value} value={method.value}>
                  {method.label}
                </option>
              ))}
            </select>
          </StaffField>
          {internal.paymentMethod === "custom" && (
            <StaffField label="Custom payment method">
              <input value={internal.customPaymentMethod} onChange={(event) => setInternalValue("customPaymentMethod", event.target.value)} />
            </StaffField>
          )}
          <label className="staff-checkbox">
            <input
              type="checkbox"
              checked={internal.splitPayment}
              onChange={(event) => setInternalValue("splitPayment", event.target.checked)}
            />
            Split payment
          </label>
          {internal.splitPayment && (
            <>
              <StaffField label="Amount collected">
                <input
                  type="number"
                  min="0"
                  max={total}
                  step="0.01"
                  value={internal.amountCollected}
                  onChange={(event) => setInternalValue("amountCollected", event.target.value)}
                />
              </StaffField>
              <StaffField label="Balance due">
                <input value={moneyLabel(Math.max(0, total - toMoneyNumber(internal.amountCollected)))} readOnly />
              </StaffField>
              <StaffField label="Next collection date">
                <input
                  type="date"
                  value={internal.balanceCollectionDate}
                  onChange={(event) => setInternalValue("balanceCollectionDate", event.target.value)}
                  required
                />
              </StaffField>
              <StaffField label="Balance notes">
                <textarea value={internal.balanceNotes} onChange={(event) => setInternalValue("balanceNotes", event.target.value)} />
              </StaffField>
            </>
          )}
          <label className="staff-checkbox">
            <input
              type="checkbox"
              checked={internal.approvalRequired}
              onChange={(event) => setInternalValue("approvalRequired", event.target.checked)}
            />
            Approval required
          </label>
          {canWriteCost && (
            <>
              <StaffField label="Cost price">
                <input value={internal.costPrice} onChange={(event) => setInternalValue("costPrice", event.target.value)} />
              </StaffField>
              <StaffField label="Gross margin">
                <input value={internal.grossMargin} onChange={(event) => setInternalValue("grossMargin", event.target.value)} />
              </StaffField>
            </>
          )}
          <StaffField label="Ops notes">
            <textarea value={internal.opsNotes} onChange={(event) => setInternalValue("opsNotes", event.target.value)} />
          </StaffField>
          <StaffField label="Receipt evidence">
            <input type="file" accept="image/*" multiple onChange={(event) => setReceiptFiles(Array.from(event.target.files || []))} />
          </StaffField>
        </div>

        <div className="staff-cart-footer">
          <div className="cart-total">
            <span>Subtotal</span>
            <strong>{moneyLabel(total)}</strong>
          </div>
          {error && <p className="staff-error">{error}</p>}
          <button className="button-primary cart-checkout" type="submit" disabled={!cart.length || status === "loading"}>
            {status === "loading" ? "Creating draft" : "Create draft order"}
          </button>
        </div>
      </form>
      </aside>
    </div>
  );
}

function orderPaymentRows(order) {
  const payment = order.internal?.payment || {};
  const method = payment.method === "custom" ? payment.customMethod : payment.method;
  return [
    ["Payment method", method],
    ["Split payment", payment.split ? "yes" : "no"],
    ["Amount collected", payment.amountCollected ? moneyLabel(payment.amountCollected) : ""],
    ["Balance due", payment.balanceDue ? moneyLabel(payment.balanceDue) : ""],
    ["Next collection", payment.balanceCollectionDate],
    ["Balance notes", payment.balanceNotes],
    ["Receipt evidence", order.internal?.paymentEvidence?.length ? `${order.internal.paymentEvidence.length} file(s)` : ""]
  ].filter(([, value]) => value !== undefined && value !== null && value !== "");
}

function orderInternalRows(order) {
  return [
    ["Supplier", order.internal?.supplier],
    ["Stockroom bin", order.internal?.stockroomBin],
    ["Approval required", order.internal?.approvalRequired ? "yes" : "no"],
    ["Cost price", order.internal?.costPrice],
    ["Gross margin", order.internal?.grossMargin],
    ["Ops notes", order.internal?.opsNotes],
    ["Created by", order.createdBy?.email],
    ["Invoice sent", order.invoiceSentAt],
    ["Completed", order.completedAt],
    ["Canceled", order.canceledAt]
  ].filter(([, value]) => value !== undefined && value !== null && value !== "");
}

function OrderDetailPanel({ order, shopifyDraftOrder, onClose }) {
  const lineItems = order.internal?.lineItems || shopifyDraftOrder?.lineItems || [];
  return (
    <section className="staff-panel staff-order-detail">
      <div className="staff-panel-head">
        <div>
          <p className="section-kicker">Invoice detail</p>
          <h2>{order.shopifyDraftOrderName || order.id}</h2>
        </div>
        <button className="button-inline" type="button" onClick={onClose}>
          Back to orders
        </button>
      </div>
      <dl className="staff-detail-grid">
        {[
          ["Status", order.status],
          ["Customer", order.customer?.email || "No email"],
          ["Fulfillment", order.fulfillment?.type || "pickup"],
          ["Shopify draft", order.shopifyDraftOrderId],
          ["Shopify order", order.shopifyOrderId],
          ["Invoice URL", order.shopifyInvoiceUrl],
          ["Created", order.createdAt],
          ["Updated", order.updatedAt],
          ["Draft total", shopifyDraftOrder?.totalPrice ? moneyLabel(shopifyDraftOrder.totalPrice) : ""]
        ]
          .filter(([, value]) => value !== undefined && value !== null && value !== "")
          .map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{String(value)}</dd>
            </div>
          ))}
      </dl>
      <div className="staff-detail-section">
        <p className="section-kicker">Payment</p>
        <dl className="staff-detail-grid">
          {orderPaymentRows(order).map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{String(value)}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="staff-detail-section">
        <p className="section-kicker">Line items</p>
        <div className="staff-order-line-list">
          {lineItems.map((item, index) => (
            <article className="staff-order-line" key={`${item.variantId || item.id || item.title}-${index}`}>
              <strong>{item.title || "Line item"}</strong>
              <span>
                {item.sku || item.variantId || "No SKU"} · qty {item.quantity || 1} · {moneyLabel(item.price || 0)}
              </span>
              {item.priceOverride && <small>Override {moneyLabel(item.priceOverride)}</small>}
              {item.appliedDiscount && <small>Discount {item.appliedDiscount.valueType || item.appliedDiscount.value_type} {item.appliedDiscount.value}</small>}
              {item.description && <small>{item.description}</small>}
            </article>
          ))}
        </div>
      </div>
      <div className="staff-detail-section">
        <p className="section-kicker">Internal</p>
        <dl className="staff-detail-grid">
          {orderInternalRows(order).map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{String(value)}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

function OrdersPanel({ staff, refreshKey }) {
  const [tab, setTab] = useState("pending");
  const [orders, setOrders] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [shopifyDraftOrder, setShopifyDraftOrder] = useState(null);
  const [status, setStatus] = useState("idle");
  const [actionStatus, setActionStatus] = useState("");
  const [error, setError] = useState("");
  const canSendInvoice = hasStaffPermission(staff, "invoice:send");
  const canCompleteOrder = hasStaffPermission(staff, "order:complete");

  const loadOrders = async () => {
    setStatus("loading");
    setError("");
    try {
      const payload = await listStaffOrders(tab);
      setOrders(payload.orders || []);
    } catch (nextError) {
      setError(nextError.message);
    } finally {
      setStatus("idle");
    }
  };

  useEffect(() => {
    loadOrders();
  }, [tab, refreshKey]);

  const handleInvoice = async (orderId) => {
    setActionStatus(orderId);
    setError("");

    try {
      await sendStaffInvoice(orderId);
      await loadOrders();
    } catch (nextError) {
      setError(nextError.message);
    } finally {
      setActionStatus("");
    }
  };

  const handleSelectOrder = async (orderId) => {
    setActionStatus(orderId);
    setError("");
    try {
      const payload = await getStaffOrder(orderId);
      setSelectedOrder(payload.order);
      setShopifyDraftOrder(payload.shopifyDraftOrder || null);
    } catch (nextError) {
      setError(nextError.message);
    } finally {
      setActionStatus("");
    }
  };

  const handleComplete = async (orderId) => {
    setActionStatus(orderId);
    setError("");

    try {
      await completeStaffOrder(orderId, false);
      await loadOrders();
    } catch (nextError) {
      setError(nextError.message);
    } finally {
      setActionStatus("");
    }
  };

  if (selectedOrder) {
    return (
      <OrderDetailPanel
        order={selectedOrder}
        shopifyDraftOrder={shopifyDraftOrder}
        onClose={() => {
          setSelectedOrder(null);
          setShopifyDraftOrder(null);
        }}
      />
    );
  }

  return (
    <section className="staff-panel staff-orders">
      <div className="staff-panel-head">
        <div>
          <p className="section-kicker">Orders</p>
          <h2>{tab === "pending" ? "Pending" : "Completed"}</h2>
        </div>
        <div className="staff-segmented">
          <button type="button" className={tab === "pending" ? "is-active" : ""} onClick={() => setTab("pending")}>
            Pending
          </button>
          <button type="button" className={tab === "completed" ? "is-active" : ""} onClick={() => setTab("completed")}>
            Completed
          </button>
        </div>
      </div>
      {error && <p className="staff-error">{error}</p>}
      {status === "loading" && <p className="staff-muted">Loading orders.</p>}
      <div className="staff-order-list">
        {orders.map((order) => (
          <article className="staff-order" key={order.id}>
            <button className="staff-order-summary" type="button" onClick={() => handleSelectOrder(order.id)}>
              <strong>{order.shopifyDraftOrderName || order.id}</strong>
              <span>{order.customer?.email || "No email"} · {order.fulfillment?.type || "pickup"}</span>
              {order.internal?.payment?.split && (
                <small>
                  Balance {moneyLabel(order.internal.payment.balanceDue)} · collect {order.internal.payment.balanceCollectionDate || "TBA"}
                </small>
              )}
              <small>{order.createdAt}</small>
            </button>
            {tab === "pending" && (canSendInvoice || canCompleteOrder) && (
              <div className="staff-order-actions">
                {canSendInvoice && (
                  <button className="button-inline" type="button" disabled={actionStatus === order.id} onClick={() => handleInvoice(order.id)}>
                    Invoice
                  </button>
                )}
                {canCompleteOrder && (
                  <button className="button-inline" type="button" disabled={actionStatus === order.id} onClick={() => handleComplete(order.id)}>
                    Complete
                  </button>
                )}
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

function detailLabel(value) {
  if (value == null || value === "") return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function AuditLogPanel() {
  const [entries, setEntries] = useState([]);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");

  const loadAudit = async () => {
    setStatus("loading");
    setError("");

    try {
      const payload = await listStaffAudit(100);
      setEntries(payload.entries || []);
    } catch (nextError) {
      setError(nextError.message);
    } finally {
      setStatus("idle");
    }
  };

  useEffect(() => {
    loadAudit();
  }, []);

  return (
    <section className="staff-panel staff-audit">
      <div className="staff-panel-head">
        <div>
          <p className="section-kicker">Audit</p>
          <h2>Staff activity</h2>
        </div>
        <button className="button-inline" type="button" disabled={status === "loading"} onClick={loadAudit}>
          Refresh
        </button>
      </div>
      {error && <p className="staff-error">{error}</p>}
      {status === "loading" && <p className="staff-muted">Loading audit log.</p>}
      <div className="staff-audit-list">
        {entries.map((entry) => {
          const details = Object.entries(entry.details || {})
            .map(([key, value]) => `${key}: ${detailLabel(value)}`)
            .filter(Boolean)
            .slice(0, 4)
            .join(" · ");
          return (
            <article className="staff-audit-row" key={entry.id}>
              <div>
                <strong>{entry.action}</strong>
                <span>{entry.actor?.email || "system"} · {entry.createdAt}</span>
                {details && <small>{details}</small>}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export default function StaffPage() {
  const [staff, setStaff] = useState(null);
  const [authStatus, setAuthStatus] = useState("checking");
  const [cart, setCart] = useState([]);
  const [isStaffCartOpen, setIsStaffCartOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const location = useLocation();
  const navigate = useNavigate();
  const visibleTabs = useMemo(
    () => STAFF_TABS.filter((tab) => tab.permissions.some((permission) => hasStaffPermission(staff, permission))),
    [staff]
  );

  useEffect(() => {
    if (!getStaffToken()) {
      setAuthStatus("ready");
      return;
    }

    getStaffMe()
      .then((payload) => setStaff(payload.staff))
      .catch(() => saveStaffToken(""))
      .finally(() => setAuthStatus("ready"));
  }, []);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("lightform:staff-nav", { detail: { visibleTabs: visibleTabs.map((tab) => tab.id) } }));
  }, [visibleTabs]);

  useEffect(() => {
    const handleOpenStaffCart = () => setIsStaffCartOpen(true);
    window.addEventListener("lightform:staff-cart-open", handleOpenStaffCart);
    return () => window.removeEventListener("lightform:staff-cart-open", handleOpenStaffCart);
  }, []);

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("lightform:staff-cart", {
        detail: { visible: hasStaffPermission(staff, "order:create"), count: cart.reduce((sum, item) => sum + item.quantity, 0) }
      })
    );
  }, [cart, staff]);

  useEffect(() => {
    if (!staff || !visibleTabs.length) return;
    const requestedTab = (location.hash || "").slice(1);
    if (requestedTab && visibleTabs.some((tab) => tab.id === requestedTab)) return;
    navigate(`/staff#${visibleTabs[0].id}`, { replace: true });
  }, [location.hash, navigate, staff, visibleTabs]);

  const addVariant = (variant) => {
    setIsStaffCartOpen(true);
    setCart((current) => {
      const existing = current.find((item) => item.variantId === variant.id);
      if (existing) {
        return current.map((item) => (item.variantId === variant.id ? { ...item, quantity: item.quantity + 1 } : item));
      }
      return [
        ...current,
        {
          variantId: variant.id,
          title: variant.product?.title || variant.title,
          sku: variant.sku,
          price: variant.price,
          unitPrice: "",
          discountType: "fixed_amount",
          discountValue: "",
          description: "",
          quantity: 1
        }
      ];
    });
  };

  const updateCartItem = (variantId, patch) => {
    setCart((current) => current.map((item) => (item.variantId === variantId ? { ...item, ...patch } : item)));
  };

  const setQuantity = (variantId, quantity) => {
    setCart((current) =>
      quantity <= 0
        ? current.filter((item) => item.variantId !== variantId)
        : current.map((item) => (item.variantId === variantId ? { ...item, quantity } : item))
    );
  };

  const handleLogout = () => {
    saveStaffToken("");
    setStaff(null);
  };

  if (authStatus === "checking") {
    return (
      <main className="staff-page">
        <section className="site-shell staff-loading">Checking staff session.</section>
      </main>
    );
  }

  if (!staff) return <LoginPanel onLogin={setStaff} />;

  const canReadInventory = hasStaffPermission(staff, "inventory:read");
  const canReadOrders = hasStaffPermission(staff, "order:read");
  const canCreateOrders = hasStaffPermission(staff, "order:create");
  const canAdjustInventory = hasStaffPermission(staff, "inventory:adjust");
  const canManageStaff = hasStaffPermission(staff, "user:manage");
  const canReadAudit = hasStaffPermission(staff, "audit:read");
  const canCurateStorefront = hasStaffPermission(staff, "storefront:curate");
  const activeTab = (location.hash || `#${visibleTabs[0]?.id || ""}`).slice(1);

  return (
    <main className="staff-page">
      <section className="staff-workspace site-shell">
        {activeTab === "orders" && canReadOrders && (
          <div className="staff-layout">
            <div className="staff-main-column">
              <OrdersPanel staff={staff} refreshKey={refreshKey} />
            </div>
          </div>
        )}
        {activeTab === "checkout" && (
          <div className="staff-layout">
            <div className="staff-main-column">
              {canReadInventory && <InventorySearch canAdd={canCreateOrders} canManage={canAdjustInventory} onAdd={addVariant} />}
            </div>
          </div>
        )}
        {activeTab === "storefront-curation" && canCurateStorefront && (
          <div className="staff-layout">
            <div className="staff-main-column">
              <StorefrontCurationPanel />
            </div>
          </div>
        )}
        {activeTab === "staff-activity" && canReadAudit && (
          <div className="staff-layout">
            <div className="staff-main-column">
              <AuditLogPanel />
            </div>
          </div>
        )}
        {activeTab === "access-management" && canManageStaff && (
          <div className="staff-layout">
            <div className="staff-main-column">
              <StaffUsersPanel />
            </div>
          </div>
        )}
      </section>
      {canCreateOrders && (
        <StaffCart
          staff={staff}
          cart={cart}
          isOpen={isStaffCartOpen}
          onClose={() => setIsStaffCartOpen(false)}
          onQuantity={setQuantity}
          onRemove={(variantId) => setQuantity(variantId, 0)}
          onItemChange={updateCartItem}
          onDraftCreated={() => {
            setCart([]);
            setIsStaffCartOpen(false);
            setRefreshKey((value) => value + 1);
          }}
        />
      )}
      <StaffHeaderSession staff={staff} onLogout={handleLogout} />
    </main>
  );
}
