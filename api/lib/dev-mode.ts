import type { SafeUser } from "../queries/users";

export function isAuthDisabled() {
  return process.env.AUTH_DISABLED === "true";
}

const now = new Date();

export const DEV_USER: SafeUser = {
  id: 1,
  unionId: "admin_union_001",
  organizationId: 1,
  name: "Sandeep",
  email: "sandeep@aumentoinfoway.com",
  avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Sandeep",
  role: "admin",
  status: "active",
  department: "Management",
  position: "Project Manager",
  phone: "+1-555-0101",
  firstName: "Sandeep",
  lastName: null,
  secondName: null,
  dateOfBirth: null,
  dateOfJoining: null,
  sex: null,
  city: null,
  address: null,
  familyContactNumber: null,
  personalEmail: null,
  bloodGroup: null,
  aadhaarCard: null,
  panCard: null,
  notificationLanguage: "en",
  employmentType: "full_time",
  headOfDepartmentUserIds: [],
  permissions: [
    "dashboard.view",
    "tasks.view_all",
    "tasks.create",
    "tasks.edit_all",
    "tasks.delete",
    "projects.manage",
    "time.view_team",
    "time.edit_all",
    "employees.manage",
    "permissions.manage",
    "analytics.view",
  ],
  createdAt: now,
  updatedAt: now,
  lastSignInAt: now,
};
