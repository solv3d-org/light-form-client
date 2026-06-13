import { useEffect, useMemo, useState } from "react";
import {
  completeStaffOrder,
  createStaffUser,
  createStaffDraftOrder,
  getStaffToken,
  getStaffMe,
  listStaffAudit,
  listStaffPermissionConfig,
  listStaffUsers,
  listStaffOrders,
  saveStaffToken,
  searchStaffInventory,
  sendStaffInvoice,
  staffLogin,
  updateStaffUser
} from "../lib/staffApi";

const STAFF_ROLES = ["viewer", "operator", "manager", "admin"];
const EMPTY_PERMISSION_OVERRIDES = { allow: [], deny: [] };
const FALLBACK_PERMISSION_CONFIG = { roles: STAFF_ROLES, permissions: [], rolePermissions: {} };

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
  costPrice: "",
  grossMargin: ""
};

function moneyLabel(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "";
  return new Intl.NumberFormat("en-SG", { style: "currency", currency: "SGD" }).format(amount);
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

function StaffUsersPanel() {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({ email: "", name: "", role: "operator", password: "" });
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");

  const loadUsers = async () => {
    setStatus("loading");
    setError("");

    try {
      const payload = await listStaffUsers();
      setUsers(payload.users || []);
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
      setForm({ email: "", name: "", role: "operator", password: "" });
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
          {STAFF_ROLES.map((role) => (
            <option key={role} value={role}>
              {role}
            </option>
          ))}
        </select>
        <input
          type="password"
          value={form.password}
          placeholder="Temporary password"
          aria-label="Temporary password"
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
          <article className="staff-user-row" key={user.id}>
            <div>
              <strong>{user.name || user.email}</strong>
              <span>{user.email}</span>
            </div>
            <span>{user.role}</span>
            <button className="button-inline" type="button" disabled={status === "saving"} onClick={() => handleToggleActive(user)}>
              {user.active ? "Disable" : "Enable"}
            </button>
          </article>
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

function InventorySearch({ onAdd }) {
  const [query, setQuery] = useState("");
  const [variants, setVariants] = useState([]);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");

  const handleSearch = async (event) => {
    event.preventDefault();
    setStatus("loading");
    setError("");

    try {
      const payload = await searchStaffInventory(query);
      setVariants(payload.variants || []);
    } catch (nextError) {
      setError(nextError.message);
    } finally {
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
        <button className="button-secondary" type="submit" disabled={status === "loading"}>
          Search
        </button>
      </form>
      {error && <p className="staff-error">{error}</p>}
      <div className="staff-result-list">
        {variants.map((variant) => (
          <article className="staff-result" key={variant.id}>
            <div>
              <strong>{variant.product?.title || "Product"}</strong>
              <span>{variant.title === "Default Title" ? variant.sku || "Default" : variant.title}</span>
              <small>
                {variant.sku || "No SKU"} · Available {variant.inventory?.available ?? 0} · {moneyLabel(variant.price)}
              </small>
            </div>
            <button className="button-inline" type="button" onClick={() => onAdd(variant)}>
              Add
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

function StaffCart({ staff, cart, onQuantity, onRemove, onDraftCreated }) {
  const [email, setEmail] = useState("");
  const [fulfillment, setFulfillment] = useState({ type: "pickup", deliveryDate: "", dateTba: false });
  const [shippingAddress, setShippingAddress] = useState(EMPTY_ADDRESS);
  const [internal, setInternal] = useState(EMPTY_INTERNAL);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const canWriteCost = staff?.role === "admin";

  const total = useMemo(
    () => cart.reduce((sum, item) => sum + Number(item.price || 0) * item.quantity, 0),
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
      const payload = await createStaffDraftOrder({
        email,
        lineItems: cart.map((item) => ({ variantId: item.variantId, quantity: item.quantity })),
        fulfillment,
        shippingAddress: fulfillment.type === "delivery" ? shippingAddress : undefined,
        internal: {
          supplier: internal.supplier,
          stockroomBin: internal.stockroomBin,
          opsNotes: internal.opsNotes,
          approvalRequired: internal.approvalRequired,
          ...(canWriteCost ? { costPrice: internal.costPrice, grossMargin: internal.grossMargin } : {})
        }
      });
      setEmail("");
      setFulfillment({ type: "pickup", deliveryDate: "", dateTba: false });
      setShippingAddress(EMPTY_ADDRESS);
      setInternal(EMPTY_INTERNAL);
      onDraftCreated(payload.order);
    } catch (nextError) {
      setError(nextError.message);
    } finally {
      setStatus("idle");
    }
  };

  return (
    <section className="staff-panel staff-cart-panel">
      <div className="staff-panel-head">
        <div>
          <p className="section-kicker">Staff cart</p>
          <h2>In-store checkout</h2>
        </div>
        <strong>{moneyLabel(total)}</strong>
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
                <div>
                  <strong>{item.title}</strong>
                  <span>{item.sku || "No SKU"} · {moneyLabel(item.price)}</span>
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
        </div>

        {error && <p className="staff-error">{error}</p>}
        <button className="button-primary" type="submit" disabled={!cart.length || status === "loading"}>
          {status === "loading" ? "Creating draft" : "Create draft order"}
        </button>
      </form>
    </section>
  );
}

function OrdersPanel({ refreshKey }) {
  const [tab, setTab] = useState("pending");
  const [orders, setOrders] = useState([]);
  const [status, setStatus] = useState("idle");
  const [actionStatus, setActionStatus] = useState("");
  const [error, setError] = useState("");

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
            <div>
              <strong>{order.shopifyDraftOrderName || order.id}</strong>
              <span>{order.customer?.email || "No email"} · {order.fulfillment?.type || "pickup"}</span>
              <small>{order.createdAt}</small>
            </div>
            {tab === "pending" && (
              <div className="staff-order-actions">
                <button className="button-inline" type="button" disabled={actionStatus === order.id} onClick={() => handleInvoice(order.id)}>
                  Invoice
                </button>
                <button className="button-inline" type="button" disabled={actionStatus === order.id} onClick={() => handleComplete(order.id)}>
                  Complete
                </button>
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

export default function StaffPage() {
  const [staff, setStaff] = useState(null);
  const [authStatus, setAuthStatus] = useState("checking");
  const [cart, setCart] = useState([]);
  const [refreshKey, setRefreshKey] = useState(0);

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

  const addVariant = (variant) => {
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
          quantity: 1
        }
      ];
    });
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

  return (
    <main className="staff-page">
      <section className="staff-workspace site-shell">
        <div className="staff-hero">
          <div>
            <p className="page-kicker">Staff IMS</p>
            <h1>Internal order desk</h1>
          </div>
          <div className="staff-session">
            <span>{staff.name || staff.email}</span>
            <strong>{staff.role}</strong>
            <button className="button-secondary" type="button" onClick={handleLogout}>
              Log out
            </button>
          </div>
        </div>
        <div className="staff-layout">
          <div className="staff-main-column">
            <InventorySearch onAdd={addVariant} />
            <OrdersPanel refreshKey={refreshKey} />
            {staff.role === "admin" && <StaffUsersPanel />}
          </div>
          <StaffCart
            staff={staff}
            cart={cart}
            onQuantity={setQuantity}
            onRemove={(variantId) => setQuantity(variantId, 0)}
            onDraftCreated={() => {
              setCart([]);
              setRefreshKey((value) => value + 1);
            }}
          />
        </div>
      </section>
    </main>
  );
}
