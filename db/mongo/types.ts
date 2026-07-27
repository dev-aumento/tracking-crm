export type UserRole = "admin" | "manager" | "employee" | "hr" | "client";
export type UserStatus = "active" | "inactive" | "suspended" | "Active" | "Inactive" | "Suspended";
export type EmploymentType = "full_time" | "intern";
export type SexOption = "male" | "female" | "other" | "prefer_not_to_say";
export type ProjectStatus = "active" | "archived" | "completed";
export type TaskStatus = "todo" | "in_progress" | "review" | "done";
export type TaskPriority = "low" | "medium" | "high" | "urgent";
export type TimeEntrySource = "web" | "mobile" | "manual";
export type InviteStatus = "pending" | "accepted" | "expired" | "revoked";

export type TaskActivityAction =
  | "created"
  | "updated"
  | "status_changed"
  | "stage_changed"
  | "priority_changed"
  | "title_changed"
  | "assigned"
  | "owner_changed"
  | "commented"
  | "time_logged"
  | "subtask_completed"
  | "tag_added"
  | "participant_added"
  | "observer_added";

export type NotificationType =
  | "task_assigned"
  | "task_updated"
  | "task_created"
  | "project_created"
  | "mention"
  | "deadline_reminder"
  | "time_approved"
  | "time_rejected"
  | "time_approval_pending"
  | "employee_joined"
  | "leave_request_pending"
  | "leave_approved"
  | "leave_rejected"
  | "leave_cancelled"
  | "holiday_reminder";

export type LeaveType = "paid" | "sick" | "unpaid" | "half" | "wfh";
export type LeaveStatus = "pending" | "approved" | "rejected" | "cancelled";

export type TimeApprovalType = "clock_in" | "break";
export type TimeApprovalStatus = "pending" | "approved" | "rejected";

/** Tenant / workspace that owns users, projects, tasks, and related data. */
export type OrganizationDoc = {
  id: number;
  name: string;
  createdBy: number | null;
  createdAt: Date;
  updatedAt: Date;
};

export type UserDoc = {
  id: number;
  /** Tenant this user belongs to. Null only for legacy rows before migration. */
  organizationId: number | null;
  unionId: string;
  name: string | null;
  email: string | null;
  passwordHash: string | null;
  avatar: string | null;
  role: UserRole;
  status: UserStatus;
  department: string | null;
  position: string | null;
  phone: string | null;
  firstName: string | null;
  lastName: string | null;
  secondName: string | null;
  dateOfBirth: Date | null;
  dateOfJoining: Date | null;
  sex: SexOption | null;
  city: string | null;
  address: string | null;
  familyContactNumber: string | null;
  /** Personal/emergency email (separate from work login email). */
  personalEmail: string | null;
  bloodGroup: string | null;
  /** Aadhaar card number (plain text). Visible to employee, HR, and admin. */
  aadhaarCard: string | null;
  /** PAN card number (plain text). Visible to employee, HR, and admin. */
  panCard: string | null;
  notificationLanguage: string | null;
  /** Owner-only private notes; never expose via SafeUser or admin personal-info APIs. */
  privateNotes: string | null;
  /**
   * `intern` → 6-month no-PL window (3 internship + 3 probation).
   * `full_time` (default) → 3-month probation no-PL window.
   */
  employmentType: EmploymentType;
  headOfDepartmentUserIds: number[];
  permissions: string[];
  /** Manual order on the Employees admin list (lower = higher). */
  sortOrder?: number;
  createdAt: Date;
  updatedAt: Date;
  lastSignInAt: Date;
};

export type SafeUser = Omit<UserDoc, "passwordHash" | "privateNotes">;

export type EmployeeInviteDoc = {
  id: number;
  organizationId: number;
  token: string;
  invitedBy: number;
  /** Invited email address (required for new invites). */
  email: string | null;
  department: string | null;
  status: InviteStatus;
  acceptedUserId: number | null;
  expiresAt: Date;
  acceptedAt: Date | null;
  createdAt: Date;
};

/** Joined employee profile — linked to users collection for login */
export type EmployeeDoc = {
  id: number;
  organizationId: number | null;
  userId: number;
  inviteId: number | null;
  name: string;
  email: string;
  passwordHash: string;
  avatar: string | null;
  department: string | null;
  position: string | null;
  phone: string | null;
  firstName: string | null;
  lastName: string | null;
  secondName: string | null;
  dateOfBirth: Date | null;
  dateOfJoining: Date | null;
  sex: SexOption | null;
  city: string | null;
  address: string | null;
  familyContactNumber: string | null;
  personalEmail: string | null;
  bloodGroup: string | null;
  aadhaarCard: string | null;
  panCard: string | null;
  notificationLanguage: string | null;
  employmentType: EmploymentType;
  headOfDepartmentUserIds: number[];
  status: UserStatus;
  permissions: string[];
  joinedAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

export type SafeEmployee = Omit<EmployeeDoc, "passwordHash">;

export type ProjectDoc = {
  id: number;
  organizationId: number | null;
  name: string;
  description: string | null;
  clientName: string | null;
  status: ProjectStatus;
  color: string | null;
  icon: string | null;
  /** Extra kanban/list sections appended after the default pipeline stages. */
  customPipelineStages?: Array<{ key: string; label: string; color: string }> | null;
  /** Display-name overrides for any stage key (defaults + custom). Keys are unchanged. */
  pipelineStageLabelOverrides?: Record<string, string> | null;
  /** Built-in stage keys hidden from this project's kanban/list (To Do / Finished cannot be hidden). */
  hiddenPipelineStageKeys?: string[] | null;
  /** Ordered stage keys for this project's kanban columns. Missing keys are appended in default order. */
  pipelineStageOrder?: string[] | null;
  createdBy: number | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ProjectMemberDoc = {
  id: number;
  projectId: number;
  userId: number;
  joinedAt: Date;
};

export type TaskDoc = {
  id: number;
  organizationId: number | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  stage: string;
  priority: TaskPriority;
  assigneeId: number | null;
  projectId: number | null;
  createdBy: number | null;
  dueDate: Date | null;
  estimatedHours: string | null;
  actualHours: string | null;
  position: number;
  createdAt: Date;
  updatedAt: Date;
};

export type TaskParticipantDoc = {
  id: number;
  taskId: number;
  userId: number;
  role: "participant" | "observer";
  createdAt: Date;
};

export type SubtaskDoc = {
  id: number;
  taskId: number;
  title: string;
  completed: boolean;
  position: number;
  createdAt: Date;
};

export type TaskTagDoc = {
  id: number;
  name: string;
  color: string | null;
  createdAt: Date;
};

export type TaskTagRelationDoc = {
  id: number;
  taskId: number;
  tagId: number;
};

export type TimeEntryDoc = {
  id: number;
  organizationId: number | null;
  userId: number;
  taskId: number | null;
  projectId: number | null;
  clockIn: Date;
  clockOut: Date | null;
  duration: number | null;
  /** Precise attendance duration in seconds (source of truth when set). */
  durationSeconds: number | null;
  note: string | null;
  source: TimeEntrySource;
  createdAt: Date;
  updatedAt: Date;
};

export type TaskActivityDoc = {
  id: number;
  taskId: number;
  userId: number | null;
  action: TaskActivityAction;
  oldValue: string | null;
  newValue: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
};

export type TaskAttachmentDoc = {
  id: number;
  taskId: number;
  fileName: string;
  mimeType: string;
  fileSize: number;
  /** @deprecated Legacy inline storage. Prefer gridFsId. */
  dataBase64?: string;
  /** GridFS ObjectId hex string for binary payload. */
  gridFsId?: string;
  /**
   * When false, attachment is comment/chat/description media only
   * and must not appear in the task Files section.
   * Missing/undefined means listed (legacy attachments).
   */
  listedInFiles?: boolean;
  uploadedBy: number | null;
  createdAt: Date;
};

/** HR/employee files on personal information (offer letter, ID scans, PDFs, etc.). */
export type EmployeeDocumentDoc = {
  id: number;
  organizationId: number | null;
  userId: number;
  fileName: string;
  mimeType: string;
  fileSize: number;
  /** Optional label e.g. "Offer letter", "PAN card". */
  label: string | null;
  gridFsId: string;
  uploadedBy: number | null;
  createdAt: Date;
};

/** Manual records of employees who left the company (HR Recent Employees). */
export type FormerEmployeeDoc = {
  id: number;
  organizationId: number | null;
  name: string;
  email: string | null;
  department: string | null;
  position: string | null;
  joiningDate: string;
  resignationDate: string;
  servedNoticePeriod: boolean;
  /** Days of notice served when servedNoticePeriod is true. */
  noticePeriodDays: number | null;
  lastWorkingDay: string;
  reasonForLeaving: string;
  notes: string | null;
  createdBy: number | null;
  createdAt: Date;
  updatedAt: Date;
};

export type FormerEmployeeDocumentDoc = {
  id: number;
  organizationId: number | null;
  formerEmployeeId: number;
  fileName: string;
  mimeType: string;
  fileSize: number;
  label: string | null;
  gridFsId: string;
  uploadedBy: number | null;
  createdAt: Date;
};

export type NotificationDoc = {
  id: number;
  organizationId: number | null;
  userId: number;
  actorId: number | null;
  type: NotificationType;
  title: string;
  message: string;
  taskId: number | null;
  projectId?: number | null;
  approvalRequestId?: number | null;
  activityId?: number | null;
  leaveRequestId?: number | null;
  holidayId?: number | null;
  read: boolean;
  createdAt: Date;
};

export type LeaveRequestDoc = {
  id: number;
  organizationId: number | null;
  userId: number;
  leaveType: LeaveType;
  /** True for half-day sick (and mirrored for leaveType "half"). */
  isHalfDay?: boolean | null;
  startDate: string;
  endDate: string;
  days: number;
  reason: string;
  status: LeaveStatus;
  reviewedBy: number | null;
  reviewedAt: Date | null;
  reviewNote: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type PublicHolidayDoc = {
  id: number;
  organizationId: number | null;
  /** YYYY-MM-DD (work-zone calendar date). */
  date: string;
  name: string;
  createdBy: number | null;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Manual monthly leave usage set by HR/admin.
 * Effective paid days used = max(auto from approved leaves, paidDaysUsed).
 */
export type LeaveUsageOverrideDoc = {
  id: number;
  organizationId: number | null;
  userId: number;
  year: number;
  /** 1–12 */
  month: number;
  /** Paid leave days counted as used for the month (0, 0.5, 1, …). */
  paidDaysUsed: number;
  updatedBy: number | null;
  createdAt: Date;
  updatedAt: Date;
};

export type TimeApprovalRequestDoc = {
  id: number;
  organizationId: number | null;
  userId: number;
  type: TimeApprovalType;
  status: TimeApprovalStatus;
  reason: string;
  workSessionId: number | null;
  timeEntryId: number | null;
  workBreakId: number | null;
  originalClockIn: Date | null;
  originalBreakStart: Date | null;
  originalBreakEnd: Date | null;
  requestedClockIn: Date | null;
  requestedBreakStart: Date | null;
  requestedBreakEnd: Date | null;
  reviewedBy: number | null;
  reviewedAt: Date | null;
  reviewNote: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type WorkSessionDoc = {
  id: number;
  userId: number;
  startTime: Date;
  endTime: Date | null;
  active: boolean;
  paused: boolean;
  accumulatedWorkSeconds: number;
  breakStartedAt: Date | null;
  workSegmentStartedAt: Date | null;
  createdAt: Date;
};

export type WorkBreakDoc = {
  id: number;
  userId: number;
  workSessionId: number;
  timeEntryId: number | null;
  startTime: Date;
  endTime: Date | null;
  reason: string | null;
  manuallyEdited: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export const DEFAULT_PERMISSIONS_BY_ROLE: Record<UserRole, string[]> = {
  admin: [
    "dashboard.view",
    "tasks.view_all",
    "tasks.create",
    "tasks.edit_all",
    "tasks.change_assignee",
    "tasks.delete",
    "projects.view",
    "projects.manage",
    "time.view_team",
    "time.edit_all",
    "time.edit_own",
    "employees.manage",
    "permissions.manage",
    "analytics.view",
    "profile.head_of_department",
  ],
  manager: [
    "dashboard.view",
    "tasks.view_all",
    "tasks.create",
    "tasks.edit_all",
    "tasks.change_assignee",
    "projects.manage",
    "time.view_team",
    "time.edit_own",
    "analytics.view",
  ],
  hr: [
    "dashboard.view",
    "time.edit_own",
    "time.view_team",
    "employees.manage",
  ],
  employee: [
    "dashboard.view",
    "tasks.view_own",
    "tasks.create",
    "tasks.edit_own",
    "time.edit_own",
    "projects.view",
  ],
  client: [
    "projects.view",
    "projects.manage",
    "tasks.view_all",
    "tasks.create",
    "tasks.edit_all",
    "tasks.change_assignee",
  ],
};
