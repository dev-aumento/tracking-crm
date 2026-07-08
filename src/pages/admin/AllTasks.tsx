import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { TaskDetailPanel } from "@/components/tasks/TaskDetailPanel";
import { TaskListView } from "@/components/tasks/TaskListView";
import { TaskSearchFilterPanel } from "@/components/tasks/TaskSearchFilterPanel";
import {
  CreateTaskModal,
  EMPTY_CREATE_TASK_FORM,
  type CreateTaskFormData,
} from "@/components/tasks/CreateTaskModal";
import {
  applyTaskSearchFilters,
  DEFAULT_TASK_SEARCH_FILTERS,
  type TaskSearchFilters,
} from "@/lib/task-search-filter";
import { canCreateTask, tryOpenCreateTask } from "@/lib/create-task-permission";
import { getTaskBulkPermissions } from "@/lib/task-bulk-permissions";
import { submitCreateTask } from "@/lib/submit-create-task";
import { TaskBulkActionBar } from "@/components/tasks/TaskBulkActionBar";
import { invalidateProjectStats } from "@/lib/project-stats";
import { Plus } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

type AdminTaskRow = {
  id: number;
  title: string;
  status: string;
  priority: string;
  assigneeId?: number | null;
  createdBy?: number | null;
  projectId?: number | null;
  participantIds?: number[];
  observerIds?: number[];
  dueDate?: string | Date | null;
  assignee?: { name: string | null; avatar?: string | null } | null;
  creator?: { name: string | null; avatar?: string | null } | null;
};

export default function AdminAllTasks() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [taskFilters, setTaskFilters] = useState<TaskSearchFilters>(DEFAULT_TASK_SEARCH_FILTERS);
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [formData, setFormData] = useState<CreateTaskFormData>(EMPTY_CREATE_TASK_FORM);
  const [isCreating, setIsCreating] = useState(false);
  const [selectedTask, setSelectedTask] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    const taskParam = searchParams.get("task");
    setSelectedTask(taskParam ? Number(taskParam) : null);
  }, [searchParams]);

  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.task.list.useQuery({ limit: 200 });
  const { data: usersData } = trpc.user.listForPicker.useQuery({ limit: 500 });
  const { data: projectsData } = trpc.project.list.useQuery();

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

  const allTasks = (data?.tasks ?? []) as AdminTaskRow[];

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

    if (statusFilter) {
      result = result.filter((t) => t.status === statusFilter);
    }
    if (priorityFilter) {
      result = result.filter((t) => t.priority === priorityFilter);
    }

    return result;
  }, [allTasks, taskFilters, search, searchContext, statusFilter, priorityFilter]);

  const resetSearch = () => {
    setSearch("");
    setTaskFilters(DEFAULT_TASK_SEARCH_FILTERS);
  };

  const hasExtraFilters = statusFilter || priorityFilter;

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

  const openTask = (id: number) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("task", String(id));
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

  const closeCreateModal = () => {
    setShowCreateModal(false);
    setFormData(EMPTY_CREATE_TASK_FORM);
  };

  const handleCreate = async () => {
    if (!formData.title.trim()) return;

    const tasksById = new Map(allTasks.map((t) => [t.id, t.title]));

    setIsCreating(true);
    try {
      await submitCreateTask({
        formData,
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
    } catch (error) {
      console.error("Failed to create task:", error);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#1F2937]">All Tasks</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {filteredTasks.length} of {data?.total ?? allTasks.length} tasks across all projects
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

      <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-wrap items-center gap-3">
        <TaskSearchFilterPanel
          open={filterPanelOpen}
          onOpenChange={setFilterPanelOpen}
          filters={taskFilters}
          onFiltersChange={setTaskFilters}
          onReset={resetSearch}
          users={usersData?.users ?? []}
          projects={(projectsData ?? []).map((p) => ({ id: p.id, name: p.name }))}
          tasks={allTasks}
          searchInput={search}
          onSearchInputChange={setSearch}
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-9 px-3 bg-gray-50 border border-gray-200 rounded-lg text-sm"
        >
          <option value="">All Statuses</option>
          <option value="todo">To Do</option>
          <option value="in_progress">In Progress</option>
          <option value="review">Review</option>
          <option value="done">Done</option>
        </select>
        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value)}
          className="h-9 px-3 bg-gray-50 border border-gray-200 rounded-lg text-sm"
        >
          <option value="">All Priorities</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="urgent">Urgent</option>
        </select>
        {hasExtraFilters && (
          <button
            type="button"
            onClick={() => {
              setStatusFilter("");
              setPriorityFilter("");
            }}
            className="h-9 px-3 text-sm text-gray-500 hover:text-[#2563EB]"
          >
            Clear status/priority
          </button>
        )}
      </div>

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
        emptyMessage="No tasks found"
        selectable={taskSelectionEnabled}
        selectedIds={selectedIds}
        onToggleSelect={toggleSelect}
        onToggleSelectAll={toggleSelectAll}
      />

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
