import { useRef, useState } from "react";
import {
  X, Flame, Calendar, Clock, Paperclip, AtSign, List, ListOrdered,
  Sparkles, ListChecks, FolderOpen, Users,
  GitBranch, Hash, Bell, Briefcase, Link2, Layers, BarChart3,
  Timer, Settings2, Loader2, UserPlus, Search, Smile, Mic, Send,
  ChevronDown, LayoutGrid, User, Play, Plus, Trash2,
} from "lucide-react";
import type { CreateTaskFormData } from "@/components/tasks/CreateTaskModal";
import {
  META_DATETIME_CLASS,
  META_SELECT_CLASS,
  TaskMetaRow,
  TaskSectionCard,
} from "@/components/tasks/task-form-ui";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TASK_CREATE_TEMPLATES } from "@/lib/task-templates";
import {
  PROJECT_PIPELINE_STAGES,
  kanbanStageColor,
  pipelineStageLabel,
  type ProjectPipelineStageKey,
} from "@/lib/task-kanban";
import { TaskFilesSection, type PendingTaskAttachment } from "@/components/tasks/TaskFilesSection";
import { readFileAsBase64 } from "@/lib/task-files";
import { cn } from "@/lib/utils";

type UserOption = { id: number; name: string | null; avatar?: string | null };
type ProjectOption = { id: number; name: string };
type TaskLinkOption = { id: number; title: string };

const FEATURE_MODULES = [
  { id: "status_summaries", label: "Task status summaries", icon: BarChart3 },
  { id: "files", label: "Files", icon: Paperclip },
  { id: "checklists", label: "Checklists", icon: ListChecks },
  { id: "flow", label: "Flow", icon: GitBranch },
  { id: "tags", label: "Tags", icon: Hash },
  { id: "reminders", label: "Reminders", icon: Bell },
  { id: "crm", label: "CRM items", icon: Briefcase },
  { id: "parent", label: "Parent task", icon: Link2 },
  { id: "subtasks", label: "Subtasks", icon: Layers },
  { id: "related", label: "Related tasks", icon: Link2 },
  { id: "gantt", label: "Gantt", icon: BarChart3 },
  { id: "time_planning", label: "Time planning", icon: Calendar },
  { id: "time_tracking", label: "Time tracking", icon: Timer },
  { id: "custom_fields", label: "Custom fields", icon: Settings2 },
] as const;

interface DetailedCreateTaskViewProps {
  formData: CreateTaskFormData;
  onFormDataChange: (data: CreateTaskFormData) => void;
  users: UserOption[];
  projects: ProjectOption[];
  tasks?: TaskLinkOption[];
  currentUser?: UserOption | null;
  isSubmitting?: boolean;
  onSubmit: () => void;
  onCancel: () => void;
}

function insertAtCursor(
  textarea: HTMLTextAreaElement,
  before: string,
  after = "",
) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const value = textarea.value;
  const selected = value.slice(start, end);
  const next = value.slice(0, start) + before + selected + after + value.slice(end);
  const cursor = start + before.length + selected.length + after.length;
  return { next, cursor };
}

function formatDurationEstimate(hours: string) {
  const n = Number(hours);
  if (!hours.trim() || Number.isNaN(n) || n <= 0) return "00:00:00";
  const totalSeconds = Math.round(n * 3600);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (v: number) => String(v).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export function DetailedCreateTaskView({
  formData,
  onFormDataChange,
  users,
  projects,
  tasks = [],
  currentUser,
  isSubmitting,
  onSubmit,
  onCancel,
}: DetailedCreateTaskViewProps) {
  const titleRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [chatInput, setChatInput] = useState("");
  const [showMentionPicker, setShowMentionPicker] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [showTimePlanning, setShowTimePlanning] = useState(false);

  const update = (patch: Partial<CreateTaskFormData>) => {
    onFormDataChange({ ...formData, ...patch });
  };

  const assignee = users.find((u) => u.id === formData.assigneeId);
  const isHot = formData.priority === "urgent" || formData.priority === "high";

  const toggleModule = (id: string) => {
    const active = formData.activeModules.includes(id);
    const nextModules = active
      ? formData.activeModules.filter((m) => m !== id)
      : [...formData.activeModules, id];

    const patch: Partial<CreateTaskFormData> = { activeModules: nextModules };

    if (!active && id === "checklists" && formData.checklistItems.every((i) => !i.trim())) {
      patch.checklistItems = [""];
    }
    if (!active && id === "subtasks" && formData.subtaskTitles.every((i) => !i.trim())) {
      patch.subtaskTitles = [""];
    }

    update(patch);
  };

  const toggleUserInList = (field: "participantIds" | "observerIds", userId: number) => {
    const list = formData[field];
    update({
      [field]: list.includes(userId)
        ? list.filter((id) => id !== userId)
        : [...list, userId],
    } as Partial<CreateTaskFormData>);
  };

  const applyDescriptionEdit = (next: string, cursor?: number) => {
    update({ description: next });
    requestAnimationFrame(() => {
      if (descriptionRef.current && cursor != null) {
        descriptionRef.current.focus();
        descriptionRef.current.setSelectionRange(cursor, cursor);
      }
    });
  };

  const handleDescriptionFormat = (type: "bullet" | "numbered" | "mention", userName?: string) => {
    const el = descriptionRef.current;
    if (!el) return;
    if (type === "mention" && userName) {
      const { next, cursor } = insertAtCursor(el, `@${userName} `);
      applyDescriptionEdit(next, cursor);
      setShowMentionPicker(false);
      return;
    }
    const { next, cursor } = insertAtCursor(el, type === "bullet" ? "- " : "1. ");
    applyDescriptionEdit(next, cursor);
  };

  const handleAttachFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const picked: PendingTaskAttachment[] = await Promise.all(
      Array.from(files).map(async (file) => ({
        clientId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        fileSize: file.size,
        dataBase64: await readFileAsBase64(file),
      })),
    );
    const modules = formData.activeModules.includes("files")
      ? formData.activeModules
      : [...formData.activeModules, "files"];
    update({
      pendingAttachments: [...formData.pendingAttachments, ...picked],
      activeModules: modules,
    });
  };

  const handleCoPilot = () => {
    const title = formData.title.trim() || "this task";
    const draft = [
      formData.description.trim(),
      `## Overview\nDefine the goal for "${title}".`,
      "## Acceptance criteria\n- \n- ",
      "## Notes\n",
    ].filter(Boolean).join("\n\n");
    update({ description: draft });
    descriptionRef.current?.focus();
  };

  const handleChecklistShortcut = () => {
    const modules = formData.activeModules.includes("checklists")
      ? formData.activeModules
      : [...formData.activeModules, "checklists"];
    update({
      activeModules: modules,
      checklistItems: formData.checklistItems.some((i) => i.trim()) ? formData.checklistItems : [""],
    });
  };

  const applyTemplate = (templateId: string) => {
    const template = TASK_CREATE_TEMPLATES.find((t) => t.id === templateId);
    if (!template) return;
    onFormDataChange({
      ...formData,
      ...template.form,
      assigneeId: formData.assigneeId ?? currentUser?.id,
      ownerId: formData.ownerId ?? currentUser?.id,
      projectId: formData.projectId ?? template.form.projectId,
      stage: formData.stage ?? template.form.stage,
    });
    setTemplatesOpen(false);
  };

  const sendChatDraft = () => {
    const message = chatInput.trim();
    if (!message) return;
    update({
      chatDrafts: [
        ...formData.chatDrafts,
        { message, at: new Date().toISOString() },
      ],
    });
    setChatInput("");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim()) {
      titleRef.current?.focus();
      return;
    }
    onSubmit();
  };

  const chatMemberCount =
    1 +
    (formData.assigneeId && formData.assigneeId !== formData.ownerId ? 1 : 0) +
    formData.participantIds.length;

  const availableParticipants = users.filter((u) => u.id !== formData.assigneeId);
  const availableObservers = users.filter(
    (u) => u.id !== formData.assigneeId && !formData.participantIds.includes(u.id),
  );

  const selectedProject = projects.find((p) => p.id === formData.projectId);

  return (
    <form onSubmit={handleSubmit} className="flex flex-col h-full min-h-0">
      <div className="flex flex-1 min-h-0 flex-col lg:flex-row">
        {/* Left — task form (matches TaskDetailPanel layout) */}
        <div className="w-full lg:w-[44%] flex flex-col min-h-0 bg-white border-r border-gray-200">
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {/* Title */}
            <section>
              <div className="flex items-start justify-between gap-3 mb-3">
                <input
                  ref={titleRef}
                  type="text"
                  value={formData.title}
                  onChange={(e) => update({ title: e.target.value })}
                  placeholder="Task name"
                  className="flex-1 text-xl font-semibold text-[#1F2937] placeholder:text-gray-300 border-0 outline-none bg-transparent leading-tight"
                />
                <div className="flex items-center gap-0.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => update({ priority: isHot ? "medium" : "urgent" })}
                    className={cn(
                      "w-9 h-9 flex items-center justify-center rounded-lg transition-colors",
                      isHot
                        ? "text-orange-500 bg-orange-50 hover:bg-orange-100"
                        : "text-gray-500 hover:bg-gray-100 hover:text-orange-400",
                    )}
                    aria-label="Toggle urgent priority"
                  >
                    <Flame size={18} />
                  </button>
                  <button
                    type="button"
                    onClick={onCancel}
                    className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-800"
                    aria-label="Close"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              {/* Description card */}
              <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                <div className="px-4 py-3">
                  <textarea
                    ref={descriptionRef}
                    value={formData.description}
                    onChange={(e) => update({ description: e.target.value })}
                    placeholder="Add a description..."
                    rows={5}
                    className="w-full min-h-[7rem] text-sm text-gray-700 border-0 outline-none bg-transparent resize-y placeholder:text-gray-400"
                  />
                </div>
                <div className="px-4 py-2.5 border-t border-gray-100 flex flex-wrap items-center gap-1">
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    className="sr-only"
                    onChange={(e) => {
                      void handleAttachFiles(e.target.files);
                      e.target.value = "";
                    }}
                  />
                  <ToolbarBtn icon={Paperclip} label="Attach files" onClick={() => fileInputRef.current?.click()} />
                  <Popover open={showMentionPicker} onOpenChange={setShowMentionPicker}>
                    <PopoverTrigger asChild>
                      <button type="button" className={TOOLBAR_BTN_CLASS} aria-label="Mention">
                        <AtSign size={16} />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-52 p-1 max-h-48 overflow-y-auto">
                      {users.map((u) => (
                        <button
                          key={u.id}
                          type="button"
                          onClick={() => handleDescriptionFormat("mention", u.name ?? "user")}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 rounded-md"
                        >
                          @{u.name}
                        </button>
                      ))}
                    </PopoverContent>
                  </Popover>
                  <ToolbarBtn icon={List} label="Bullet list" onClick={() => handleDescriptionFormat("bullet")} />
                  <ToolbarBtn icon={ListOrdered} label="Numbered list" onClick={() => handleDescriptionFormat("numbered")} />
                  <span className="w-px h-5 bg-gray-200 mx-1" />
                  <button
                    type="button"
                    onClick={handleCoPilot}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg text-violet-500 hover:bg-violet-50 text-xs font-medium"
                  >
                    <Sparkles size={14} /> CoPilot
                  </button>
                  <button
                    type="button"
                    onClick={handleChecklistShortcut}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg text-violet-500 hover:bg-violet-50 text-xs font-medium"
                  >
                    <ListChecks size={14} /> Checklist
                  </button>
                </div>
              </div>
            </section>

            <TaskFilesSection
              pendingFiles={formData.pendingAttachments}
              onPendingFilesChange={(pendingAttachments) => update({ pendingAttachments })}
            />

            {/* Task details */}
            <TaskSectionCard title="Task details">
              <div className="px-4 py-1 text-sm">
                <TaskMetaRow label="Task owner" icon={User}>
                  <select
                    value={formData.ownerId || ""}
                    onChange={(e) => update({ ownerId: e.target.value ? Number(e.target.value) : undefined })}
                    className={META_SELECT_CLASS}
                  >
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                </TaskMetaRow>

                <TaskMetaRow label="Assignees" icon={Users}>
                  <select
                    value={formData.assigneeId || ""}
                    onChange={(e) =>
                      update({ assigneeId: e.target.value ? Number(e.target.value) : undefined })
                    }
                    className={META_SELECT_CLASS}
                  >
                    <option value="">Unassigned</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                </TaskMetaRow>

                <TaskMetaRow label="Deadline" icon={Clock}>
                  <input
                    type="datetime-local"
                    value={toDateTimeLocalValue(formData.dueDate)}
                    onChange={(e) =>
                      update({
                        dueDate: e.target.value ? new Date(e.target.value).toISOString() : "",
                      })
                    }
                    className={META_DATETIME_CLASS}
                  />
                </TaskMetaRow>

                <TaskMetaRow label="Time tracking" icon={Timer}>
                  <button
                    type="button"
                    onClick={() => setShowTimePlanning((v) => !v)}
                    className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-[#2563EB] transition-colors"
                  >
                    <Clock size={14} className="text-gray-400" />
                    <span className="font-mono tabular-nums">
                      {formatDurationEstimate(formData.estimatedHours)}
                    </span>
                    <span className="text-gray-400">estimate</span>
                    <ChevronDown size={14} className={cn("text-gray-400 transition-transform", showTimePlanning && "rotate-180")} />
                  </button>
                </TaskMetaRow>

                {showTimePlanning && (
                  <div className="pl-[calc(16px+0.75rem+6.75rem)] -mt-1 pb-2">
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      value={formData.estimatedHours}
                      onChange={(e) => update({ estimatedHours: e.target.value })}
                      placeholder="Estimated hours (e.g. 4)"
                      className="h-9 w-full max-w-[240px] rounded-lg border border-gray-200 px-3 text-sm"
                    />
                  </div>
                )}

                <TaskMetaRow label="Priority" icon={Play}>
                  <select
                    value={formData.priority}
                    onChange={(e) =>
                      update({ priority: e.target.value as CreateTaskFormData["priority"] })
                    }
                    className={META_SELECT_CLASS}
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </TaskMetaRow>
              </div>
            </TaskSectionCard>

            {/* Project & stage */}
            <TaskSectionCard>
              <div className="px-4 py-1 text-sm">
                <TaskMetaRow label="Project" icon={FolderOpen}>
                  <select
                    value={formData.projectId || ""}
                    onChange={(e) =>
                      update({ projectId: e.target.value ? Number(e.target.value) : undefined })
                    }
                    className={META_SELECT_CLASS}
                  >
                    <option value="">No project</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </TaskMetaRow>

                <TaskMetaRow label="Stage" icon={LayoutGrid}>
                  <select
                    value={formData.stage || "new"}
                    onChange={(e) =>
                      update({ stage: e.target.value as ProjectPipelineStageKey })
                    }
                    className={cn(
                      META_SELECT_CLASS,
                      "rounded-full border-blue-100 bg-blue-50 text-[#2563EB] font-medium",
                    )}
                  >
                    {PROJECT_PIPELINE_STAGES.map((stage) => (
                      <option key={stage.key} value={stage.key}>{stage.label}</option>
                    ))}
                  </select>
                </TaskMetaRow>
              </div>
            </TaskSectionCard>

            {/* Status summary */}
            {formData.activeModules.includes("status_summaries") && (
              <div className="flex items-center gap-2 px-4 py-3 rounded-xl border border-gray-200 bg-gray-50/50">
                <input
                  type="text"
                  value={formData.statusSummary}
                  onChange={(e) => update({ statusSummary: e.target.value })}
                  placeholder="Task status summary is required"
                  className="flex-1 text-sm bg-transparent border-0 outline-none placeholder:text-gray-400"
                />
              </div>
            )}

            {/* Feature module pills */}
            <div className="flex flex-wrap gap-2">
              {FEATURE_MODULES.map((mod) => {
                const Icon = mod.icon;
                const active = formData.activeModules.includes(mod.id);
                return (
                  <button
                    key={mod.id}
                    type="button"
                    onClick={() => toggleModule(mod.id)}
                    className={cn(
                      "h-8 px-3 rounded-full border text-xs font-medium flex items-center gap-1.5 transition-colors",
                      active
                        ? "border-[#2563EB] bg-blue-50/60 text-[#2563EB]"
                        : "border-gray-200 text-gray-600 hover:bg-gray-50",
                    )}
                  >
                    <Icon size={13} />
                    {mod.label}
                  </button>
                );
              })}
            </div>

            {/* Module panels */}
            <div className="space-y-3">
              {formData.activeModules.includes("checklists") && (
                <ModulePanel label="Checklist" onRemove={() => toggleModule("checklists")}>
                  <StringListEditor
                    items={formData.checklistItems}
                    onChange={(items) => update({ checklistItems: items })}
                    placeholder="Checklist item"
                  />
                </ModulePanel>
              )}

              {formData.activeModules.includes("tags") && (
                <ModulePanel label="Tags" onRemove={() => toggleModule("tags")}>
                  <input
                    type="text"
                    value={formData.tags}
                    onChange={(e) => update({ tags: e.target.value })}
                    placeholder="e.g. design, urgent (comma separated)"
                    className="w-full h-9 text-sm border border-gray-200 rounded-lg px-3"
                  />
                </ModulePanel>
              )}

              {formData.activeModules.includes("reminders") && (
                <ModulePanel label="Reminder" onRemove={() => toggleModule("reminders")}>
                  <input
                    type="datetime-local"
                    value={toDateTimeLocalValue(formData.reminderDate)}
                    onChange={(e) =>
                      update({
                        reminderDate: e.target.value ? new Date(e.target.value).toISOString() : "",
                      })
                    }
                    className={META_DATETIME_CLASS}
                  />
                </ModulePanel>
              )}

              {formData.activeModules.includes("crm") && (
                <ModulePanel label="CRM item" onRemove={() => toggleModule("crm")}>
                  <input
                    type="text"
                    value={formData.crmItem}
                    onChange={(e) => update({ crmItem: e.target.value })}
                    placeholder="CRM deal or contact reference"
                    className="w-full h-9 text-sm border border-gray-200 rounded-lg px-3"
                  />
                </ModulePanel>
              )}

              {formData.activeModules.includes("parent") && (
                <ModulePanel label="Parent task" onRemove={() => toggleModule("parent")}>
                  <select
                    value={formData.parentTaskId || ""}
                    onChange={(e) =>
                      update({
                        parentTaskId: e.target.value ? Number(e.target.value) : undefined,
                      })
                    }
                    className="w-full h-9 text-sm border border-gray-200 rounded-lg px-3"
                  >
                    <option value="">No parent task</option>
                    {tasks.map((t) => (
                      <option key={t.id} value={t.id}>{t.title}</option>
                    ))}
                  </select>
                </ModulePanel>
              )}

              {formData.activeModules.includes("subtasks") && (
                <ModulePanel label="Subtasks" onRemove={() => toggleModule("subtasks")}>
                  <StringListEditor
                    items={formData.subtaskTitles}
                    onChange={(items) => update({ subtaskTitles: items })}
                    placeholder="Subtask title"
                  />
                </ModulePanel>
              )}

              {formData.activeModules.includes("related") && (
                <ModulePanel label="Related tasks" onRemove={() => toggleModule("related")}>
                  <div className="flex flex-wrap gap-2 max-h-36 overflow-y-auto">
                    {tasks.map((t) => {
                      const selected = formData.relatedTaskIds.includes(t.id);
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() =>
                            update({
                              relatedTaskIds: selected
                                ? formData.relatedTaskIds.filter((id) => id !== t.id)
                                : [...formData.relatedTaskIds, t.id],
                            })
                          }
                          className={cn(
                            "px-2.5 py-1 rounded-full text-xs font-medium border transition-colors text-left max-w-full truncate",
                            selected
                              ? "border-[#2563EB] bg-blue-50 text-[#2563EB]"
                              : "border-gray-200 text-gray-600 hover:bg-white",
                          )}
                        >
                          {t.title}
                        </button>
                      );
                    })}
                    {tasks.length === 0 && (
                      <p className="text-sm text-gray-400">No tasks available to link.</p>
                    )}
                  </div>
                </ModulePanel>
              )}

              {formData.activeModules.includes("time_planning") && (
                <ModulePanel label="Time planning" onRemove={() => toggleModule("time_planning")}>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Estimated hours</label>
                      <input
                        type="number"
                        min="0"
                        step="0.5"
                        value={formData.estimatedHours}
                        onChange={(e) => update({ estimatedHours: e.target.value })}
                        className="w-full h-9 text-sm border border-gray-200 rounded-lg px-3"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Due date</label>
                      <input
                        type="datetime-local"
                        value={toDateTimeLocalValue(formData.dueDate)}
                        onChange={(e) =>
                          update({
                            dueDate: e.target.value ? new Date(e.target.value).toISOString() : "",
                          })
                        }
                        className="w-full h-9 text-sm border border-gray-200 rounded-lg px-3"
                      />
                    </div>
                  </div>
                </ModulePanel>
              )}

              {formData.activeModules.includes("gantt") && (
                <ModulePanel label="Gantt" onRemove={() => toggleModule("gantt")}>
                  <div className="text-sm text-gray-600 space-y-1">
                    <p>Start: {new Date().toLocaleDateString()}</p>
                    <p>Due: {formData.dueDate ? new Date(formData.dueDate).toLocaleString() : "Not set"}</p>
                    <p>Estimate: {formData.estimatedHours || "0"}h</p>
                    {selectedProject && (
                      <p className="flex items-center gap-2">
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: kanbanStageColor(formData.stage) }}
                        />
                        {pipelineStageLabel(formData.stage)} · {selectedProject.name}
                      </p>
                    )}
                  </div>
                </ModulePanel>
              )}

              {formData.activeModules.includes("flow") && (
                <ModulePanel label="Flow" onRemove={() => toggleModule("flow")}>
                  <p className="text-sm text-gray-600">
                    Task will be created in{" "}
                    <span className="font-medium text-[#2563EB]">
                      {pipelineStageLabel(formData.stage)}
                    </span>
                    {assignee ? ` and assigned to ${assignee.name}` : ""}.
                  </p>
                </ModulePanel>
              )}

              {formData.activeModules.includes("custom_fields") && (
                <ModulePanel label="Custom fields" onRemove={() => toggleModule("custom_fields")}>
                  <div className="space-y-2">
                    {formData.customFields.map((field, i) => (
                      <div key={i} className="flex gap-2">
                        <input
                          type="text"
                          value={field.key}
                          onChange={(e) => {
                            const next = [...formData.customFields];
                            next[i] = { ...next[i], key: e.target.value };
                            update({ customFields: next });
                          }}
                          placeholder="Field name"
                          className="flex-1 h-9 text-sm border border-gray-200 rounded-lg px-3"
                        />
                        <input
                          type="text"
                          value={field.value}
                          onChange={(e) => {
                            const next = [...formData.customFields];
                            next[i] = { ...next[i], value: e.target.value };
                            update({ customFields: next });
                          }}
                          placeholder="Value"
                          className="flex-1 h-9 text-sm border border-gray-200 rounded-lg px-3"
                        />
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() =>
                        update({ customFields: [...formData.customFields, { key: "", value: "" }] })
                      }
                      className="text-xs text-[#2563EB] font-medium"
                    >
                      + Add field
                    </button>
                  </div>
                </ModulePanel>
              )}
            </div>

            {/* Participants & observers — always visible like task view */}
            <TaskSectionCard className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Participants</span>
              </div>
              <UserMultiSelect
                users={availableParticipants}
                selected={formData.participantIds}
                onToggle={(id) => toggleUserInList("participantIds", id)}
              />
              {formData.participantIds.length === 0 && (
                <p className="text-sm text-gray-400 mt-1">No participants selected</p>
              )}

              <div className="mt-5 pt-5 border-t border-gray-100">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Observers</span>
                </div>
                <p className="text-xs text-gray-400 mb-2">
                  Observers receive updates without being assigned.
                </p>
                <UserMultiSelect
                  users={availableObservers}
                  selected={formData.observerIds}
                  onToggle={(id) => toggleUserInList("observerIds", id)}
                />
                {formData.observerIds.length === 0 && (
                  <p className="text-sm text-gray-400 mt-1">No observers selected</p>
                )}
              </div>
            </TaskSectionCard>
          </div>

          {/* Footer */}
          <div className="shrink-0 border-t border-gray-200 px-6 py-4 flex items-center justify-between bg-white">
            <div className="flex items-center gap-4">
              <button
                type="submit"
                disabled={isSubmitting}
                className="h-10 px-6 bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded-xl text-sm font-semibold disabled:opacity-50 flex items-center gap-2"
              >
                {isSubmitting && <Loader2 size={14} className="animate-spin" />}
                Create
              </button>
              <button
                type="button"
                onClick={onCancel}
                className="text-sm font-medium text-gray-600 hover:text-gray-900"
              >
                Cancel
              </button>
            </div>
            <Popover open={templatesOpen} onOpenChange={setTemplatesOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
                >
                  Templates
                  <ChevronDown size={14} />
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-48 p-1">
                {TASK_CREATE_TEMPLATES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => applyTemplate(t.id)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 rounded-md"
                  >
                    {t.label}
                  </button>
                ))}
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* Right — task chat */}
        <div className="flex-1 flex flex-col min-h-[280px] lg:min-h-0 bg-[#E8F0FE]">
          <div className="px-5 py-3 bg-white/80 border-b border-gray-200 shrink-0">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold text-[#1F2937]">Task chat</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  {chatMemberCount} member{chatMemberCount !== 1 ? "s" : ""}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button type="button" className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:bg-white/80">
                  <UserPlus size={16} />
                </button>
                <button type="button" className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:bg-white/80">
                  <Search size={16} />
                </button>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {formData.chatDrafts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full py-8">
                <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-white/80 p-6 text-center">
                  <h4 className="font-semibold text-[#1F2937] mb-4">Task chat</h4>
                  <ul className="text-sm text-gray-600 space-y-2 text-left max-w-xs mx-auto">
                    <li>• Call chat members</li>
                    <li>• Share documents and files</li>
                    <li>• Discuss progress and results</li>
                    <li>• Track task updates</li>
                  </ul>
                </div>
                <span className="mt-6 text-xs text-gray-400 bg-white/60 px-3 py-1 rounded-full">today</span>
              </div>
            ) : (
              formData.chatDrafts.map((draft, i) => (
                <div
                  key={`${draft.at}-${i}`}
                  className="rounded-xl px-4 py-3 text-sm max-w-[90%] bg-white border border-gray-200 text-gray-800 ml-auto"
                >
                  <p className="font-semibold text-xs text-gray-500 mb-1">{currentUser?.name ?? "You"}</p>
                  <p>{draft.message}</p>
                  <p className="text-[10px] text-gray-400 mt-1">Draft · sends on create</p>
                </div>
              ))
            )}
          </div>

          <div className="shrink-0 bg-white/90 border-t border-gray-200/80 p-3">
            <div className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-xl px-2 py-1.5 shadow-sm">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendChatDraft();
                  }
                }}
                placeholder="Type @ or + to mention a person, a chat or AI"
                className="flex-1 min-w-0 h-9 px-2 text-sm bg-transparent text-gray-800 placeholder:text-gray-400 outline-none"
              />
              <button type="button" className="w-9 h-9 flex items-center justify-center text-gray-400 hover:text-gray-600">
                <Smile size={18} />
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-9 h-9 flex items-center justify-center text-gray-400 hover:text-gray-600"
              >
                <Paperclip size={18} />
              </button>
              <button type="button" className="w-9 h-9 flex items-center justify-center text-gray-400 hover:text-gray-600">
                <Mic size={18} />
              </button>
              <button
                type="button"
                onClick={sendChatDraft}
                disabled={!chatInput.trim()}
                className="w-9 h-9 flex items-center justify-center rounded-lg bg-[#2563EB] text-white hover:bg-[#1D4ED8] disabled:opacity-40"
              >
                <Send size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </form>
  );
}

const TOOLBAR_BTN_CLASS =
  "w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600";

function ToolbarBtn({
  icon: Icon,
  label,
  onClick,
}: {
  icon: React.ComponentType<{ size?: number }>;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className={TOOLBAR_BTN_CLASS} aria-label={label} title={label}>
      <Icon size={16} />
    </button>
  );
}

function ModulePanel({
  label,
  children,
  onRemove,
}: {
  label: string;
  children: React.ReactNode;
  onRemove?: () => void;
}) {
  return (
    <div className="p-3 rounded-xl border border-gray-200 bg-gray-50/40">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</p>
        {onRemove && (
          <button type="button" onClick={onRemove} className="text-xs text-gray-400 hover:text-gray-600">
            Hide
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

function StringListEditor({
  items,
  onChange,
  placeholder,
}: {
  items: string[];
  onChange: (items: string[]) => void;
  placeholder: string;
}) {
  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <input
          key={i}
          type="text"
          value={item}
          onChange={(e) => {
            const next = [...items];
            next[i] = e.target.value;
            onChange(next);
          }}
          placeholder={`${placeholder} ${i + 1}`}
          className="w-full h-9 text-sm border border-gray-200 rounded-lg px-3"
        />
      ))}
      <button
        type="button"
        onClick={() => onChange([...items, ""])}
        className="text-xs text-[#2563EB] font-medium"
      >
        + Add item
      </button>
    </div>
  );
}

function UserMultiSelect({
  users,
  selected,
  onToggle,
}: {
  users: UserOption[];
  selected: number[];
  onToggle: (id: number) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
      {users.map((u) => {
        const isSelected = selected.includes(u.id);
        return (
          <button
            key={u.id}
            type="button"
            onClick={() => onToggle(u.id)}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors",
              isSelected
                ? "border-[#2563EB] bg-blue-50 text-[#2563EB]"
                : "border-gray-200 text-gray-600 hover:bg-white",
            )}
          >
            <UserAvatar name={u.name} avatar={u.avatar} size={18} />
            {u.name}
          </button>
        );
      })}
    </div>
  );
}

function toDateTimeLocalValue(value?: string | Date | null) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
