export const ROLES = ["viewer", "operator", "manager", "admin"];

export const PERMISSIONS = Object.freeze([
  { key: "inventory:read", label: "Read inventory" },
  { key: "inventory:adjust", label: "Adjust inventory" },
  { key: "order:read", label: "Read orders" },
  { key: "order:create", label: "Create draft orders" },
  { key: "order:update", label: "Update orders" },
  { key: "invoice:send", label: "Send invoices" },
  { key: "order:complete", label: "Complete orders" },
  { key: "order:cancel", label: "Cancel orders" },
  { key: "discount:apply", label: "Apply discounts" },
  { key: "cost:write", label: "Write cost fields" },
  { key: "user:manage", label: "Manage staff" },
  { key: "audit:read", label: "Read audit log" },
  { key: "sync:manage", label: "Manage Shopify sync" }
]);

const PERMISSION_KEYS = new Set(PERMISSIONS.map((permission) => permission.key));

export const ROLE_PERMISSIONS = Object.freeze({
  viewer: ["inventory:read", "order:read"],
  operator: ["inventory:read", "order:read", "order:create", "order:update", "invoice:send", "order:complete"],
  manager: [
    "inventory:read",
    "inventory:adjust",
    "order:read",
    "order:create",
    "order:update",
    "invoice:send",
    "order:complete",
    "order:cancel",
    "discount:apply"
  ],
  admin: ["*"]
});

export function normalizeRole(role) {
  return ROLES.includes(role) ? role : "";
}

export function normalizePermissionList(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((permission) => PERMISSION_KEYS.has(permission)))].sort();
}

export function normalizePermissionOverrides(value) {
  const allow = normalizePermissionList(value?.allow);
  const deny = normalizePermissionList(value?.deny);
  const denySet = new Set(deny);
  return {
    allow: allow.filter((permission) => !denySet.has(permission)),
    deny
  };
}

export function getRolePermissions(role) {
  const permissions = ROLE_PERMISSIONS[role] || [];
  return permissions.includes("*") ? PERMISSIONS.map((item) => item.key) : permissions;
}

export function getEffectivePermissions(subject) {
  const role = typeof subject === "string" ? subject : subject?.role;
  const base = new Set(getRolePermissions(role));
  if (ROLE_PERMISSIONS[role]?.includes("*")) {
    for (const permission of PERMISSIONS) base.add(permission.key);
  }

  const overrides = typeof subject === "string" ? { allow: [], deny: [] } : normalizePermissionOverrides(subject?.permissionOverrides);
  for (const permission of overrides.allow) base.add(permission);
  for (const permission of overrides.deny) base.delete(permission);
  return [...base].sort();
}

export function hasPermission(subject, permission) {
  const role = typeof subject === "string" ? subject : subject?.role;
  if (ROLE_PERMISSIONS[role]?.includes("*") && !subject?.permissionOverrides?.deny?.includes(permission)) return true;
  return getEffectivePermissions(subject).includes(permission);
}

export function assertPermission(user, permission) {
  if (!user) {
    const error = new Error("Authentication required.");
    error.status = 401;
    throw error;
  }

  if (!hasPermission(user, permission)) {
    const error = new Error("Forbidden.");
    error.status = 403;
    throw error;
  }
}
