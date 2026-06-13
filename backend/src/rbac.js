export const ROLES = ["viewer", "operator", "manager", "admin"];

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

export function hasPermission(role, permission) {
  const permissions = ROLE_PERMISSIONS[role] || [];
  return permissions.includes("*") || permissions.includes(permission);
}

export function assertPermission(user, permission) {
  if (!user) {
    const error = new Error("Authentication required.");
    error.status = 401;
    throw error;
  }

  if (!hasPermission(user.role, permission)) {
    const error = new Error("Forbidden.");
    error.status = 403;
    throw error;
  }
}
