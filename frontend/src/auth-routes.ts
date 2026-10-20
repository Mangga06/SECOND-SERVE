export const roleHome = (role: string) =>
  ({
    USER: "/dashboard",
    CAFETERIA_MANAGER: "/manager",
    ORGANIZATION_ADMIN: "/organization",
    SUPER_ADMIN: "/admin",
  })[role] || "/dashboard";
