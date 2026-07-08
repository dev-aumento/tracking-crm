export const PERMISSION_GROUPS = [
  {
    id: "dashboard",
    label: "Dashboard",
    permissions: [{ key: "dashboard.view", label: "View dashboard" }],
  },
  {
    id: "tasks",
    label: "Tasks",
    permissions: [
      { key: "tasks.view_own", label: "View own tasks" },
      { key: "tasks.view_all", label: "View all tasks" },
      { key: "tasks.create", label: "Create tasks" },
      { key: "tasks.edit_own", label: "Edit own tasks" },
      { key: "tasks.edit_all", label: "Edit all tasks" },
      { key: "tasks.delete", label: "Delete tasks" },
    ],
  },
  {
    id: "projects",
    label: "Projects",
    permissions: [
      { key: "projects.view", label: "View projects" },
      { key: "projects.manage", label: "Create & manage projects" },
    ],
  },
  {
    id: "time",
    label: "Time tracking",
    permissions: [
      { key: "time.edit_own", label: "Clock in/out & own time" },
      { key: "time.view_team", label: "View team time entries" },
      { key: "time.edit_all", label: "Edit all time entries" },
    ],
  },
  {
    id: "analytics",
    label: "Analytics",
    permissions: [{ key: "analytics.view", label: "View analytics" }],
  },
  {
    id: "admin",
    label: "Administration",
    permissions: [
      { key: "employees.manage", label: "Manage employees" },
      { key: "permissions.manage", label: "Manage permissions" },
    ],
  },
] as const;

export const ALL_PERMISSION_KEYS = PERMISSION_GROUPS.flatMap((g) =>
  g.permissions.map((p) => p.key),
);

export type AppPermissionKey = (typeof ALL_PERMISSION_KEYS)[number];

export const ROUTE_PERMISSIONS: Record<string, AppPermissionKey | AppPermissionKey[]> = {
  "/": "dashboard.view",
  "/tasks": ["tasks.view_own", "tasks.view_all"],
  "/task-chats": ["tasks.view_own", "tasks.view_all"],
  "/projects": ["projects.view", "projects.manage"],
  "/time-tracking": ["time.edit_own", "time.view_team", "time.edit_all"],
  "/analytics": "analytics.view",
  "/admin/employees": "employees.manage",
  "/admin/permissions": "permissions.manage",
  "/admin/tasks": "tasks.view_all",
};
