import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { TaskDetailPanel } from "@/components/tasks/TaskDetailPanel";
import { TaskDeadlineFunnel } from "@/components/tasks/TaskDeadlineFunnel";
import { TaskListView } from "@/components/tasks/TaskListView";
import { TaskViewToolbar, type TaskView } from "@/components/tasks/TaskViewToolbar";
import {
  CreateTaskModal,
  EMPTY_CREATE_TASK_FORM,
  type CreateTaskFormData,
} from "@/components/tasks/CreateTaskModal";
import { getDeadlineColumn } from "@/lib/task-deadline";
import {
  countTasksByRoleFilter,
  filterTasksByRole,
  type TaskRoleFilter,
} from "@/lib/task-role-filter";
import {
  applyTaskSearchFilters,
  DEFAULT_TASK_SEARCH_FILTERS,
  type TaskSearchFilters,
} from "@/lib/task-search-filter";
import {
  consumeTaskCreatePrefill,
} from "@/lib/task-create-prefill";
import { submitCreateTask } from "@/lib/submit-create-task";
import {
  canCreateTask,
  notifyCreateTaskDenied,
  tryOpenCreateTask,
} from "@/lib/create-task-permission";
import { getTaskBulkPermissions } from "@/lib/task-bulk-permissions";
import { invalidateProjectStats } from "@/lib/project-stats";
import { TaskBulkActionBar } from "@/components/tasks/TaskBulkActionBar";
import { motion, AnimatePresence } from "framer-motion";
import { Plus } from "lucide-react";

const VALID_VIEWS: TaskView[] = ["list", "deadline"];

function parseView(raw: string | null): TaskView {
  if (raw === "kanban") return "list";
  if (raw === "planner" || raw === "calendar" || raw === "gantt" || raw === "observer") {
    return "deadline";
  }
  if (raw && VALID_VIEWS.includes(raw as TaskView)) return raw as TaskView;
  return "list";
}

type TaskRow = {
  id: number;
  title: string;
  description?: string | null;
  status: string;
  priority: string;
  assigneeId?: number | null;
  createdBy?: number | null;
  projectId?: number | null;
  participantIds?: number[];
  observerIds?: number[];
  dueDate?: string | Date | null;
  actualHours?: string | null;
  assignee?: {
    name: string | null;
    avatar?: string | null;
    role?: string;
  } | null;
};

export default function Tasks() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const view = parseView(searchParams.get("view"));

  const [formData, setFormData] = useState<CreateTaskFormData>(EMPTY_CREATE_TASK_FORM);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedTask, setSelectedTask] = useState<number | null>(null);
  const [cloneSourceTitle, setCloneSourceTitle] = useState<string | null>(null);

  useEffect(() => {
    if (searchParams.get("view") === "kanban") {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set("view", "list");
        return next;
      }, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (searchParams.get("view") === "chats") {
      const task = searchParams.get("task");
      navigate(task ? `/task-chats?task=${task}` : "/task-chats", { replace: true });
    }
  }, [searchParams, navigate]);

  useEffect(() => {
    const taskParam = searchParams.get("task");
    setSelectedTask(taskParam ? Number(taskParam) : null);
  }, [searchParams]);

  useEffect(() => {
    if (searchParams.get("create") === "true" && user?.id) {
      if (!canCreateTask(user)) {
        notifyCreateTaskDenied();
        setSearchParams((prev) => {
          const next = new URLSearchParams(prev);
          next.delete("create");
          next.delete("from");
          return next;
        });
        return;
      }

      const from = searchParams.get("from");
      const prefill = from === "template" || from === "clone" ? consumeTaskCreatePrefill() : null;

      if (from === "clone" && prefill) {
        setCloneSourceTitle(prefill.sourceTitle);
      } else {
        setCloneSourceTitle(null);
      }

      setFormData({
        ...EMPTY_CREATE_TASK_FORM,
        ...prefill?.form,
        assigneeId: prefill?.form.assigneeId ?? user.id,
        ownerId: prefill?.form.ownerId ?? user.id,
      });
      setShowCreateModal(true);
      return;
    }

    setShowCreateModal(false);
    setCloneSourceTitle(null);
  }, [searchParams, user?.id]);

  const [search, setSearch] = useState("");
  const [taskFilters, setTaskFilters] = useState<TaskSearchFilters>(DEFAULT_TASK_SEARCH_FILTERS);
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const [roleFilter, setRoleFilter] = useState<TaskRoleFilter>("all");
  const [showOverdueOnly, setShowOverdueOnly] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const setView = (next: TaskView) => {
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      p.set("view", next);
      return p;
    });
  };

  const openTask = (id: number) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("task", String(id));
      next.delete("create");
      next.delete("from");
      return next;
    });
  };

  const closeTask = () => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("task");
      return next;
    });
  };

  const closeCreateModal = () => {
    setShowCreateModal(false);
    setCloneSourceTitle(null);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("create");
      next.delete("from");
      return next;
    });
  };

  const openCreateModal = () => {
    tryOpenCreateTask(user, () => {
      setFormData({
        ...EMPTY_CREATE_TASK_FORM,
        assigneeId: user?.id,
        ownerId: user?.id,
      });
      setShowCreateModal(true);
    });
  };

  const { data: taskData, isLoading } = trpc.task.list.useQuery({
    limit: 200,
  });

  const { data: usersData } = trpc.user.listForPicker.useQuery({ limit: 500 });
  const { data: projectsData } = trpc.project.list.useQuery();

  const utils = trpc.useUtils();
  const addParticipantMutation = trpc.task.addParticipant.useMutation();
  const addObserverMutation = trpc.task.addObserver.useMutation();
  const createMutation = trpc.task.create.useMutation();
  const updateMutation = trpc.task.update.useMutation();
  const createSubtaskMutation = trpc.subtask.create.useMutation();
  const addCommentMutation = trpc.task.addComment.useMutation();
  const addAttachmentMutation = trpc.task.addAttachment.useMutation();

  const bulkActionMutation = trpc.task.bulkAction.useMutation({
    onSuccess: async () => {
      setSelectedIds(new Set());
      await utils.task.list.invalidate();
      invalidateProjectStats(utils);
    },
  });

  const canCreate = canCreateTask(user);
  const { canBulkEdit, canBulkDelete, taskSelectionEnabled } = getTaskBulkPermissions(user);
  const allTasks = (taskData?.tasks ?? []) as TaskRow[];
  const userId = user?.id ?? 0;

  const roleCounts = useMemo(
    () => countTasksByRoleFilter(allTasks, userId),
    [allTasks, userId],
  );

  const searchContext = useMemo(
    () => ({
      users: usersData?.users ?? [],
      projects: (projectsData ?? []).map((p) => ({ id: p.id, name: p.name })),
    }),
    [usersData?.users, projectsData],
  );

  const filteredTasks = useMemo(() => {
    let result = applyTaskSearchFilters(
      allTasks,
      { ...taskFilters, text: search },
      searchContext,
    );

    result = filterTasksByRole(result, roleFilter, userId);

    if (showOverdueOnly) {
      result = result.filter((t) => getDeadlineColumn(t) === "overdue");
    }

    return result;
  }, [allTasks, taskFilters, search, userId, showOverdueOnly, searchContext, roleFilter]);

  const updateTaskFilters = (next: TaskSearchFilters) => {
    setTaskFilters(next);
  };

  const resetSearch = () => {
    setSearch("");
    setTaskFilters(DEFAULT_TASK_SEARCH_FILTERS);
    setRoleFilter("all");
    setShowOverdueOnly(false);
    setFilterPanelOpen(false);
  };

  const handleRoleFilterChange = (role: TaskRoleFilter) => {
    setRoleFilter(role);
  };

  const overdueCount = useMemo(
    () => allTasks.filter((t) => getDeadlineColumn(t) === "overdue").length,
    [allTasks]
  );

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const visibleIds = filteredTasks.map((t) => t.id);
    const allSelected =
      visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));

    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        visibleIds.forEach((id) => next.delete(id));
      } else {
        visibleIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  const runBulkAction = (
    action: "delete" | "status" | "move_project",
    extra?: { status?: "todo" | "in_progress" | "review" | "done"; projectId?: number | null },
  ) => {
    if (selectedIds.size === 0) return;
    bulkActionMutation.mutate({
      taskIds: [...selectedIds],
      action,
      ...extra,
    });
  };

  const [isCreating, setIsCreating] = useState(false);

  const handleCreate = async () => {
    if (!formData.title.trim()) return;

    const tasksById = new Map(allTasks.map((t) => [t.id, t.title]));

    setIsCreating(true);
    try {
      await submitCreateTask({
        formData,
        cloneSourceTitle,
        createMutation,
        addParticipantMutation,
        addObserverMutation,
        updateMutation,
        createSubtaskMutation,
        addCommentMutation,
        addAttachmentMutation,
        tasksById,
      });

      await utils.task.list.invalidate();
      closeCreateModal();
      setFormData(EMPTY_CREATE_TASK_FORM);
    } catch (error) {
      console.error("Failed to create task:", error);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#1F2937]">My Tasks</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Manage tasks in list and deadline views
          </p>
        </div>
        {canCreate ? (
          <button
            type="button"
            onClick={openCreateModal}
            className="h-9 px-4 bg-[#2563EB] text-white rounded-lg text-sm font-semibold hover:bg-[#1D4ED8] flex items-center gap-2 shrink-0"
          >
            <Plus size={16} />
            Add Task
          </button>
        ) : null}
      </div>

      <TaskViewToolbar
        view={view}
        onViewChange={setView}
        search={search}
        onSearchChange={setSearch}
        searchFilters={taskFilters}
        onSearchFiltersChange={updateTaskFilters}
        onResetSearch={resetSearch}
        filterPanelOpen={filterPanelOpen}
        onFilterPanelOpenChange={setFilterPanelOpen}
        filterUsers={usersData?.users ?? []}
        filterProjects={(projectsData ?? []).map((p) => ({ id: p.id, name: p.name }))}
        filterTasks={allTasks}
        roleFilter={roleFilter}
        onRoleFilterChange={handleRoleFilterChange}
        roleCounts={roleCounts}
        overdueCount={overdueCount}
        showOverdueOnly={showOverdueOnly}
        onToggleOverdue={() => setShowOverdueOnly((v) => !v)}
        canCreate={canCreate}
        onCreateClick={openCreateModal}
      />

      {view === "list" && (
        <>
          <TaskBulkActionBar
            selectedCount={selectedIds.size}
            canBulkEdit={canBulkEdit}
            canBulkDelete={canBulkDelete}
            projects={(projectsData ?? []).map((p) => ({ id: p.id, name: p.name }))}
            isPending={bulkActionMutation.isPending}
            onChangeStatus={(status) => runBulkAction("status", { status })}
            onMoveProject={(projectId) => runBulkAction("move_project", { projectId })}
            onDelete={() => {
              if (!window.confirm(`Delete ${selectedIds.size} task(s)? This cannot be undone.`)) {
                return;
              }
              runBulkAction("delete");
            }}
            onClear={() => setSelectedIds(new Set())}
          />
          <TaskListView
            tasks={filteredTasks}
            isLoading={isLoading}
            onTaskClick={openTask}
            selectable={taskSelectionEnabled}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            onToggleSelectAll={toggleSelectAll}
          />
        </>
      )}

      {view === "deadline" && (
        <TaskDeadlineFunnel
          tasks={filteredTasks}
          isLoading={isLoading}
          onTaskClick={openTask}
          onCreateClick={canCreate ? openCreateModal : undefined}
        />
      )}

      <CreateTaskModal
        open={showCreateModal}
        onClose={closeCreateModal}
        formData={formData}
        onFormDataChange={setFormData}
        onSubmit={handleCreate}
        isSubmitting={isCreating}
        users={usersData?.users ?? []}
        projects={projectsData ?? []}
        tasks={allTasks.map((t) => ({ id: t.id, title: t.title }))}
        currentUser={
          user
            ? { id: user.id, name: user.name, avatar: user.avatar }
            : null
        }
      />

      <AnimatePresence>
        {selectedTask && (
          <TaskDetailPanel taskId={selectedTask} onClose={closeTask} onTaskOpen={openTask} />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
