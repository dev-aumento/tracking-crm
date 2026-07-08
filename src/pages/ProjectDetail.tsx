import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { ProjectHeaderCard } from "@/components/projects/ProjectHeaderCard";
import { TaskKanbanBoard } from "@/components/tasks/TaskKanbanBoard";
import { TaskListView } from "@/components/tasks/TaskListView";
import { TaskDetailPanel } from "@/components/tasks/TaskDetailPanel";
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
import {
  computeProjectHoursTracked,
  computeProjectStatsFromTasks,
  invalidateProjectStats,
} from "@/lib/project-stats";
import { hasPermission } from "@/lib/permissions";
import { canCreateTask, tryOpenCreateTask } from "@/lib/create-task-permission";
import type { ProjectPipelineStageKey } from "@/lib/task-kanban";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, LayoutGrid, List, Loader2, UserPlus, X, Trash2 } from "lucide-react";
import { useNavigate } from "react-router";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type ProjectTaskView = "list" | "kanban";

function parseProjectView(raw: string | null): ProjectTaskView {
  return raw === "kanban" ? "kanban" : "list";
}

export default function ProjectDetail() {
  const { id } = useParams();
  const projectId = Number(id);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();

  const taskView = parseProjectView(searchParams.get("view"));
  const selectedTask = searchParams.get("task") ? Number(searchParams.get("task")) : null;
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", description: "" });
  const [formData, setFormData] = useState<CreateTaskFormData>(EMPTY_CREATE_TASK_FORM);
  const [isCreating, setIsCreating] = useState(false);
  const [search, setSearch] = useState("");
  const [taskFilters, setTaskFilters] = useState<TaskSearchFilters>(DEFAULT_TASK_SEARCH_FILTERS);
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkStatus, setBulkStatus] = useState<"todo" | "in_progress" | "review" | "done">("todo");
  const [bulkMoveProjectId, setBulkMoveProjectId] = useState<number | null>(null);

  const utils = trpc.useUtils();

  const { data: project, isLoading: projectLoading } = trpc.project.getById.useQuery(
    { id: projectId },
    { enabled: Number.isFinite(projectId) && projectId > 0 },
  );

  const canViewTasks = Boolean(project?.canViewTasks);

  useEffect(() => {
    if (!projectLoading && project && !canViewTasks && selectedTask) {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete("task");
        return next;
      });
    }
  }, [projectLoading, project, canViewTasks, selectedTask, setSearchParams]);

  const { data: taskData, isLoading: tasksLoading } = trpc.task.list.useQuery(
    { projectId, limit: 200 },
    {
      enabled:
        Number.isFinite(projectId) && projectId > 0 && !projectLoading && canViewTasks,
      staleTime: 0,
    },
  );

  const { data: usersData } = trpc.user.listForPicker.useQuery({ limit: 500 });
  const { data: projectsData } = trpc.project.list.useQuery();

  const addParticipantMutation = trpc.task.addParticipant.useMutation();
  const addObserverMutation = trpc.task.addObserver.useMutation();
  const createMutation = trpc.task.create.useMutation();
  const updateMutation = trpc.task.update.useMutation();
  const createSubtaskMutation = trpc.subtask.create.useMutation();
  const addCommentMutation = trpc.task.addComment.useMutation();
  const addAttachmentMutation = trpc.task.addAttachment.useMutation();

  const updateProjectMutation = trpc.project.update.useMutation({
    onSuccess: () => {
      invalidateProjectStats(utils, projectId);
      setShowEditModal(false);
    },
  });

  const deleteProjectMutation = trpc.project.delete.useMutation({
    onSuccess: async () => {
      setShowDeleteConfirm(false);
      await utils.project.list.invalidate();
      await utils.task.list.invalidate();
      navigate("/projects", { replace: true });
    },
  });

  const joinProjectMutation = trpc.project.join.useMutation({
    onSuccess: async () => {
      await utils.project.getById.invalidate({ id: projectId });
      await utils.task.list.invalidate({ projectId, limit: 200 });
    },
  });

  const bulkActionMutation = trpc.task.bulkAction.useMutation({
    onSuccess: async () => {
      setSelectedIds(new Set());
      await utils.task.list.invalidate();
      invalidateProjectStats(utils, projectId);
    },
  });

  const canManage = hasPermission(user, "projects.manage");
  const canCreate = canCreateTask(user);
  const canBulkEdit =
    user?.role === "admin" ||
    user?.role === "manager" ||
    hasPermission(user, "tasks.edit_all") ||
    hasPermission(user, "tasks.edit_own");
  const canBulkDelete =
    user?.role === "admin" ||
    user?.role === "manager" ||
    hasPermission(user, "tasks.delete");
  const taskSelectionEnabled = canViewTasks && (canBulkEdit || canBulkDelete);
  const allTasks = canViewTasks ? (taskData?.tasks ?? []) : [];
  const userId = user?.id ?? 0;

  const searchContext = useMemo(
    () => ({
      users: usersData?.users ?? [],
      projects: project ? [{ id: project.id, name: project.name }] : [],
    }),
    [usersData?.users, project],
  );

  const filteredTasks = useMemo(
    () =>
      applyTaskSearchFilters(
        allTasks,
        { ...taskFilters, text: search },
        searchContext,
      ),
    [allTasks, taskFilters, search, searchContext],
  );

  const resetSearch = () => {
    setSearch("");
    setTaskFilters(DEFAULT_TASK_SEARCH_FILTERS);
  };

  const stats = useMemo(() => {
    if (!canViewTasks && project?.stats) {
      return project.stats;
    }
    return computeProjectStatsFromTasks(allTasks);
  }, [allTasks, canViewTasks, project?.stats]);

  const hoursTracked = useMemo(() => {
    if (!canViewTasks && project?.hoursTracked != null) {
      return project.hoursTracked;
    }
    return computeProjectHoursTracked(allTasks);
  }, [allTasks, canViewTasks, project?.hoursTracked]);

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

  const openTask = (taskId: number) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("task", String(taskId));
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

  const setTaskView = (view: ProjectTaskView) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (view === "kanban") next.set("view", "kanban");
      else next.delete("view");
      return next;
    });
  };

  const openEdit = () => {
    if (!project) return;
    setEditForm({ name: project.name, description: project.description ?? "" });
    setShowEditModal(true);
  };

  const openCreateModal = (stage?: ProjectPipelineStageKey) => {
    tryOpenCreateTask(user, () => {
      setFormData({
        ...EMPTY_CREATE_TASK_FORM,
        assigneeId: user?.id,
        ownerId: user?.id,
        projectId,
        stage,
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
      invalidateProjectStats(utils, projectId);
      closeCreateModal();
    } catch (error) {
      console.error("Failed to create task:", error);
    } finally {
      setIsCreating(false);
    }
  };

  if (!Number.isFinite(projectId) || projectId <= 0) {
    return (
      <div className="py-16 text-center">
        <p className="text-gray-500">Invalid project.</p>
        <Link to="/projects" className="text-[#2563EB] text-sm mt-2 inline-block">Back to projects</Link>
      </div>
    );
  }

  if (projectLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 size={28} className="animate-spin text-gray-400" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="py-16 text-center">
        <p className="text-gray-500">Project not found.</p>
        <Link to="/projects" className="text-[#2563EB] text-sm mt-2 inline-block">Back to projects</Link>
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
      <Link
        to="/projects"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-[#2563EB] transition-colors"
      >
        <ArrowLeft size={16} />
        Back to projects
      </Link>

      <ProjectHeaderCard
        name={project.name}
        description={project.description}
        status={project.status}
        dueDate={project.dueDate}
        stats={stats}
        hoursTracked={hoursTracked}
        memberCount={project.memberCount ?? 1}
        creatorName={project.creator?.name ?? null}
        canEdit={canManage}
        canDelete={canManage}
        canViewTasks={canViewTasks}
        onEdit={openEdit}
        onDelete={() => setShowDeleteConfirm(true)}
        onAddTask={canCreate && canViewTasks ? () => openCreateModal() : undefined}
        onJoinProject={
          !canViewTasks
            ? () => joinProjectMutation.mutate({ projectId })
            : undefined
        }
        joinPending={joinProjectMutation.isPending}
      />

      {!canViewTasks ? (
        <div className="bg-white border border-gray-200 rounded-xl py-16 px-6 text-center">
          <UserPlus size={40} className="mx-auto text-gray-300 mb-3" />
          <h3 className="text-lg font-semibold text-[#1F2937] mb-2">
            Join this project to view tasks
          </h3>
          <p className="text-sm text-gray-500 mb-6 max-w-md mx-auto">
            You can browse project details here. Tasks and the task board are only visible after
            you join the project team.
          </p>
          <button
            type="button"
            onClick={() => joinProjectMutation.mutate({ projectId })}
            disabled={joinProjectMutation.isPending}
            className="inline-flex items-center gap-2 h-10 px-5 bg-[#2563EB] text-white rounded-lg text-sm font-semibold hover:bg-[#1D4ED8] disabled:opacity-50"
          >
            {joinProjectMutation.isPending ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <UserPlus size={16} />
            )}
            Join Project
          </button>
        </div>
      ) : (
        <>
      <div className="max-w-md">
        <TaskSearchFilterPanel
          open={filterPanelOpen}
          onOpenChange={setFilterPanelOpen}
          filters={taskFilters}
          onFiltersChange={setTaskFilters}
          onReset={resetSearch}
          users={usersData?.users ?? []}
          projects={project ? [{ id: project.id, name: project.name }] : []}
          tasks={allTasks}
          searchInput={search}
          onSearchInputChange={setSearch}
        />
      </div>

      <div className="flex items-center gap-1 p-1 bg-gray-100 rounded-lg w-fit">
        <button
          type="button"
          onClick={() => setTaskView("list")}
          className={`flex items-center gap-1.5 h-8 px-3 rounded-md text-sm font-medium transition-colors ${
            taskView === "list"
              ? "bg-white text-[#1F2937] shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          <List size={15} />
          List
        </button>
        <button
          type="button"
          onClick={() => setTaskView("kanban")}
          className={`flex items-center gap-1.5 h-8 px-3 rounded-md text-sm font-medium transition-colors ${
            taskView === "kanban"
              ? "bg-white text-[#1F2937] shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          <LayoutGrid size={15} />
          Kanban
        </button>
      </div>

      {selectedIds.size > 0 && taskSelectionEnabled ? (
        <div className="flex flex-wrap items-center gap-3 p-3 bg-blue-50 border border-blue-100 rounded-xl">
          <span className="text-sm font-medium text-[#1F2937]">
            {selectedIds.size} selected
          </span>

          {canBulkEdit ? (
            <>
              <select
                value={bulkStatus}
                onChange={(e) =>
                  setBulkStatus(e.target.value as "todo" | "in_progress" | "review" | "done")
                }
                className="h-9 px-2 border border-gray-200 rounded-lg text-sm bg-white"
              >
                <option value="todo">To do</option>
                <option value="in_progress">In progress</option>
                <option value="review">Review</option>
                <option value="done">Done</option>
              </select>
              <button
                type="button"
                disabled={bulkActionMutation.isPending}
                onClick={() => runBulkAction("status", { status: bulkStatus })}
                className="h-9 px-3 bg-white border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
              >
                Change status
              </button>

              <select
                value={bulkMoveProjectId ?? ""}
                onChange={(e) =>
                  setBulkMoveProjectId(e.target.value === "" ? null : Number(e.target.value))
                }
                className="h-9 px-2 border border-gray-200 rounded-lg text-sm bg-white max-w-[200px]"
              >
                <option value="">Move to project…</option>
                {(projectsData ?? [])
                  .filter((p) => p.id !== projectId)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                <option value="-1">No project</option>
              </select>
              <button
                type="button"
                disabled={bulkActionMutation.isPending || bulkMoveProjectId === null}
                onClick={() =>
                  runBulkAction("move_project", {
                    projectId: bulkMoveProjectId === -1 ? null : bulkMoveProjectId,
                  })
                }
                className="h-9 px-3 bg-white border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
              >
                Move
              </button>
            </>
          ) : null}

          {canBulkDelete ? (
            <button
              type="button"
              disabled={bulkActionMutation.isPending}
              onClick={() => {
                if (!window.confirm(`Delete ${selectedIds.size} task(s)? This cannot be undone.`)) {
                  return;
                }
                runBulkAction("delete");
              }}
              className="h-9 px-3 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              <Trash2 size={14} />
              Delete
            </button>
          ) : null}

          <button
            type="button"
            onClick={() => setSelectedIds(new Set())}
            className="h-9 px-3 text-sm text-gray-600 hover:text-gray-800"
          >
            Clear
          </button>
        </div>
      ) : null}

      {taskView === "list" ? (
        <TaskListView
          tasks={filteredTasks}
          isLoading={tasksLoading}
          onTaskClick={openTask}
          emptyMessage="No tasks in this project yet."
          selectable={taskSelectionEnabled}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          onToggleSelectAll={toggleSelectAll}
        />
      ) : (
        <TaskKanbanBoard
          tasks={filteredTasks}
          isLoading={tasksLoading}
          onTaskClick={openTask}
          canCreate={canCreate && canViewTasks}
          projectId={projectId}
          onCreateClick={canCreate && canViewTasks ? openCreateModal : undefined}
        />
      )}
        </>
      )}

      <AnimatePresence>
        {selectedTask && (
          <TaskDetailPanel taskId={selectedTask} onClose={closeTask} onTaskOpen={openTask} />
        )}
      </AnimatePresence>

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
        {showEditModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4"
            onClick={() => setShowEditModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden"
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
                <h2 className="font-semibold text-[#1F2937]">Edit Project</h2>
                <button type="button" onClick={() => setShowEditModal(false)} className="text-gray-400 hover:text-gray-600">
                  <X size={20} />
                </button>
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!editForm.name.trim()) return;
                  updateProjectMutation.mutate({
                    id: projectId,
                    name: editForm.name,
                    description: editForm.description || undefined,
                  });
                }}
                className="p-5 space-y-4"
              >
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                  <input
                    type="text"
                    required
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    className="w-full h-10 px-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <textarea
                    value={editForm.description}
                    onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                    className="w-full h-20 px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
                  />
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowEditModal(false)}
                    className="h-10 px-4 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={updateProjectMutation.isPending}
                    className="h-10 px-4 bg-[#2563EB] text-white rounded-lg text-sm font-semibold disabled:opacity-50 flex items-center gap-2"
                  >
                    {updateProjectMutation.isPending && <Loader2 size={14} className="animate-spin" />}
                    Save
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete project?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete &quot;{project.name}&quot; and all of its tasks.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteProjectMutation.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
              disabled={deleteProjectMutation.isPending}
              onClick={(event) => {
                event.preventDefault();
                deleteProjectMutation.mutate({ id: projectId });
              }}
            >
              {deleteProjectMutation.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  );
}
