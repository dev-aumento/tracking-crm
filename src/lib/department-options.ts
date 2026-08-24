/** Departments employees can assign in profile settings. */
export const EMPLOYEE_DEPARTMENT_OPTIONS = [
  "Developer",
  "Designer",
  "QA",
  "UI/UX Designer",
] as const;

/** Full list including leadership / admin roles (admin & manager profile edits). */
export const DEPARTMENT_OPTIONS = [
  "Administrator",
  "Project Manager",
  ...EMPLOYEE_DEPARTMENT_OPTIONS,
  "HR",
  "Finance",
] as const;

/** Chart labels used on the HR Employees-by-Department overview. */
export const HR_OVERVIEW_DEPARTMENT_LABELS = [
  "Developer",
  "Designer",
  "QA",
  "UI/UX",
] as const;

export type DepartmentOption = (typeof DEPARTMENT_OPTIONS)[number];
export type EmployeeDepartmentOption = (typeof EMPLOYEE_DEPARTMENT_OPTIONS)[number];
export type HrOverviewDepartmentLabel = (typeof HR_OVERVIEW_DEPARTMENT_LABELS)[number];

export type DepartmentSelectScope = "employee" | "all";

/**
 * Map a stored department value onto an HR overview chart bucket.
 * Leadership / admin departments (HR, Project Manager, …) return null and are omitted.
 */
export function normalizeHrOverviewDepartment(
  department?: string | null,
): HrOverviewDepartmentLabel | null {
  const raw = (department ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!raw) return null;

  // UI/UX Designer → UI/UX (check before generic Designer)
  if (
    raw === "ui/ux" ||
    raw === "ui/ux designer" ||
    raw === "uiux" ||
    raw === "ui-ux" ||
    raw === "ui ux" ||
    raw === "ui ux designer" ||
    (raw.includes("ui") && raw.includes("ux"))
  ) {
    return "UI/UX";
  }

  // QA Engineer → QA
  if (
    raw === "qa" ||
    raw === "qa engineer" ||
    raw === "quality assurance" ||
    raw.startsWith("qa ")
  ) {
    return "QA";
  }

  if (raw === "developer" || raw === "developers" || raw === "dev") {
    return "Developer";
  }
  if (raw === "designer" || raw === "designers" || raw === "design") {
    return "Designer";
  }

  return null;
}
/**
 * Options for a department `<select>`.
 * - `employee`: Developer, Designer, QA, UI/UX Designer only
 * - `all`: includes Administrator, Project Manager, HR, Finance
 *
 * If `current` is set and not in the list (legacy value), it is prepended so the
 * controlled select keeps a valid selected value — without offering managerial
 * departments as new choices for employees.
 */
export function departmentSelectOptions(
  current?: string | null,
  scope: DepartmentSelectScope = "all",
): string[] {
  const base =
    scope === "employee"
      ? [...EMPLOYEE_DEPARTMENT_OPTIONS]
      : [...DEPARTMENT_OPTIONS];
  const trimmed = current?.trim() ?? "";
  if (!trimmed) return base;
  if (base.some((option) => option === trimmed)) return base;
  // Keep an existing out-of-list value visible/selected without expanding choices.
  return [trimmed, ...base];
}

/** Profile settings: employees pick from the staff list; admins/managers see all. */
export function departmentSelectScopeForRole(
  role?: string | null,
): DepartmentSelectScope {
  if (role === "admin" || role === "manager" || role === "hr" || role === "finance") {
    return "all";
  }
  return "employee";
}
