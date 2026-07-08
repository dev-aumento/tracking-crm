export type UserRole = "admin" | "manager" | "employee";
export type UserStatus = "active" | "inactive" | "suspended";
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
  | "assigned"
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
  | "employee_joined";

export type TimeApprovalType = "clock_in" | "break";
export type TimeApprovalStatus = "pending" | "approved" | "rejected";

export type UserDoc = {
  id: number;
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
  sex: SexOption | null;
  city: string | null;
  notificationLanguage: string | null;
  headOfDepartmentUserIds: number[];
  permissions: string[];
  createdAt: Date;
  updatedAt: Date;
  lastSignInAt: Date;
};

export type SafeUser = Omit<UserDoc, "passwordHash">;

export type EmployeeInviteDoc = {
  id: number;
  token: string;
  invitedBy: number;
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
  sex: SexOption | null;
  city: string | null;
  notificationLanguage: string | null;
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
  name: string;
  description: string | null;
  status: ProjectStatus;
  color: string | null;
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
  dataBase64: string;
  uploadedBy: number | null;
  createdAt: Date;
};

export type NotificationDoc = {
  id: number;
  userId: number;
  actorId: number | null;
  type: NotificationType;
  title: string;
  message: string;
  taskId: number | null;
  projectId?: number | null;
  approvalRequestId?: number | null;
  read: boolean;
  createdAt: Date;
};

export type TimeApprovalRequestDoc = {
  id: number;
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
    "tasks.delete",
    "projects.manage",
    "time.view_team",
    "time.edit_all",
    "employees.manage",
    "permissions.manage",
    "analytics.view",
  ],
  manager: [
    "dashboard.view",
    "tasks.view_all",
    "tasks.create",
    "tasks.edit_all",
    "projects.manage",
    "time.view_team",
    "time.edit_own",
    "analytics.view",
  ],
  employee: [
    "dashboard.view",
    "tasks.view_own",
    "tasks.create",
    "tasks.edit_own",
    "time.edit_own",
    "projects.view",
  ],
};
