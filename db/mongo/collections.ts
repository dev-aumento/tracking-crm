export const Collections = {
  counters: "counters",
  users: "users",
  employees: "employees",
  employeeInvites: "employee_invites",
  projects: "projects",
  projectMembers: "project_members",
  tasks: "tasks",
  taskParticipants: "task_participants",
  subtasks: "subtasks",
  taskTags: "task_tags",
  taskTagRelations: "task_tag_relations",
  timeEntries: "time_entries",
  taskActivity: "task_activity",
  taskAttachments: "task_attachments",
  notifications: "notifications",
  workSessions: "work_sessions",
  workBreaks: "work_breaks",
  timeApprovalRequests: "time_approval_requests",
  appSettings: "app_settings",
} as const;

export type CollectionName = (typeof Collections)[keyof typeof Collections];
