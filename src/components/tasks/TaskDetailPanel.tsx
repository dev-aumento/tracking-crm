import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { useSidebarWidth } from "@/hooks/useSidebarWidth";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { formatTimeAgo, formatElapsedHMS, cn } from "@/lib/utils";
import { formatDueLabel, formatOverdueLabel, isTaskOverdue } from "@/lib/task-deadline";
import { invalidateProjectStats } from "@/lib/project-stats";
import {
  isTaskFavorite,
  readTaskPref,
  setTaskFavorite,
  TASK_PREFS_CHANGED_EVENT,
  writeTaskPref,
} from "@/lib/task-prefs";
import { setTaskCreatePrefill } from "@/lib/task-create-prefill";
import { canCreateTask, tryOpenCreateTask } from "@/lib/create-task-permission";
import { getDisplayDescription } from "@/lib/task-files";
import { TaskFilesSection } from "@/components/tasks/TaskFilesSection";
import { TaskTimeLoggedSection } from "@/components/tasks/TaskTimeLoggedSection";
import {
  getWorkflowTransitions,
  resolveWorkflowState,
  workflowLabel,
  workflowStateToDb,
  type WorkflowState,
} from "@/lib/task-workflow";
import type { DbTaskStatus } from "@/lib/task-workflow";
import { KANBAN_STAGES, kanbanStageColor, kanbanStageLabel, taskPipelineStage, type ProjectPipelineStageKey } from "@/lib/task-kanban";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  X, Clock, Play, Pause,
  Loader2, Plus, Link2, ExternalLink,
  Paperclip, LayoutGrid, Smile, Mic, Send, ChevronDown, ChevronUp, Trash2,
  Flame, Menu, UserPlus, Search, PanelRightClose, PanelRightOpen, MoreHorizontal,
  EyeOff, VolumeX, Volume2, CheckSquare, ListTree, CopyPlus, LayoutTemplate,
  Star, Store, Bot, ChevronRight, Calendar, Folder, User, Users, Copy,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface TaskDetailPanelProps {
  taskId: number;
  onClose: () => void;
  onTaskOpen?: (taskId: number) => void;
}

const QUICK_EMOJIS = ["👍", "😊", "🎉", "✅", "❤️", "🔥"];

const MARKET_APPS = [
  { id: "slack", name: "Slack", description: "Post task updates to a Slack channel" },
  { id: "gdrive", name: "Google Drive", description: "Attach and sync files from Drive" },
  { id: "github", name: "GitHub", description: "Link commits and pull requests" },
  { id: "zapier", name: "Zapier", description: "Connect this task to 5,000+ apps" },
] as const;

const AUTOMATION_RULES = [
  { id: "status_notify", label: "Notify participants when status changes" },
  { id: "deadline_remind", label: "Send reminder 1 day before deadline" },
  { id: "assignee_notify", label: "Notify assignee on new comments" },
  { id: "complete_archive", label: "Move to archive when marked done" },
] as const;

function toDateTimeLocalValue(value?: string | Date | null) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const META_SELECT_CHEVRON =
  "bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg xmlns%3D%22http://www.w3.org/2000/svg%22 width%3D%2216%22 height%3D%2216%22 viewBox%3D%220 0 24 24%22 fill%3D%22none%22 stroke%3D%22%239CA3AF%22 stroke-width%3D%222%22 stroke-linecap%3D%22round%22 stroke-linejoin%3D%22round%22%3E%3Cpath d%3D%22m6 9 6 6 6-6%22/%3E%3C/svg%3E')]";

const META_SELECT_CLASS = cn(
  "h-9 w-full max-w-[240px] rounded-lg border border-gray-200 bg-white px-3 pr-9",
  "text-sm text-gray-800 appearance-none bg-no-repeat bg-[length:16px] bg-[right_0.7rem_center]",
  META_SELECT_CHEVRON,
);

const META_DATETIME_CLASS = cn(
  "h-9 w-full max-w-[240px] rounded-lg border border-gray-200 bg-white px-3",
  "text-sm text-gray-800 [color-scheme:light]",
  "[&::-webkit-calendar-picker-indicator]:opacity-60 [&::-webkit-calendar-picker-indicator]:cursor-pointer",
  "[&::-webkit-datetime-edit]:leading-9 [&::-webkit-datetime-edit-fields-wrapper]:p-0",
);

function formatTaskDateTime(value?: string | Date | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function TaskDetailPanel({ taskId, onClose, onTaskOpen }: TaskDetailPanelProps) {
  const sidebarWidth = useSidebarWidth();
  const utils = trpc.useUtils();
  const { data: task, isLoading } = trpc.task.getById.useQuery({ id: taskId });
  const { data: timeData } = trpc.task.getTimeTracked.useQuery({ taskId });
  const { data: activeTimer } = trpc.task.getActiveTimer.useQuery(
    { taskId },
    { refetchInterval: (q) => (q.state.data?.startedAt && !q.state.data?.paused ? 1000 : false) },
  );
  const { data: usersData } = trpc.user.listForPicker.useQuery({ limit: 500 });
  const { data: projectsData } = trpc.project.list.useQuery();

  const [timerElapsed, setTimerElapsed] = useState(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  useEffect(() => {
    if (!activeTimer?.startedAt || activeTimer.paused) {
      setTimerElapsed(activeTimer?.accumulatedSeconds ?? 0);
      return;
    }
    const start = new Date(activeTimer.startedAt).getTime();
    const base = activeTimer.accumulatedSeconds ?? 0;
    const tick = () => setTimerElapsed(base + Math.max(0, Math.floor((Date.now() - start) / 1000)));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [activeTimer?.startedAt, activeTimer?.paused, activeTimer?.accumulatedSeconds]);

  const isTimerRunning = !!activeTimer?.startedAt && !activeTimer?.paused;
  const isTimerPaused = !!activeTimer?.paused;
  const hasActiveSession = !!activeTimer;
  const liveSessionSeconds = isTimerRunning ? timerElapsed : (activeTimer?.accumulatedSeconds ?? 0);
  const trackedSeconds = (timeData?.totalSeconds ?? 0) + (hasActiveSession ? liveSessionSeconds : 0);

  const panel = (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[125] bg-black/35"
        onClick={onClose}
        aria-hidden
      />
      <motion.aside
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", damping: 32, stiffness: 320 }}
        style={{ left: sidebarWidth, width: `calc(100vw - ${sidebarWidth}px)` }}
        className="fixed top-0 bottom-0 z-[130] bg-[#EEF0F3] flex overflow-visible border-l border-gray-200 shadow-[4px_0_24px_rgba(15,23,42,0.08)]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {isLoading || !task ? (
          <div className="flex-1 flex items-center justify-center bg-white">
            <Loader2 size={32} className="animate-spin text-gray-400" />
          </div>
        ) : (
          <TaskPanelContent
            key={taskId}
            task={task}
            taskId={taskId}
            onClose={onClose}
            onTaskOpen={onTaskOpen}
            usersData={usersData?.users ?? []}
            projectsData={projectsData ?? []}
            timeData={timeData}
            trackedSeconds={trackedSeconds}
            liveSessionSeconds={liveSessionSeconds}
            isTimerRunning={isTimerRunning}
            isTimerPaused={isTimerPaused}
            hasActiveSession={hasActiveSession}
          />
        )}
      </motion.aside>
    </AnimatePresence>
  );

  return createPortal(panel, document.body);
}

function TaskPanelContent({
  task,
  taskId,
  onClose,
  onTaskOpen,
  usersData,
  projectsData,
  timeData,
  trackedSeconds,
  liveSessionSeconds,
  isTimerRunning,
  isTimerPaused,
  hasActiveSession,
}: {
  task: NonNullable<ReturnType<typeof trpc.task.getById.useQuery>["data"]>;
  taskId: number;
  onClose: () => void;
  onTaskOpen?: (taskId: number) => void;
  usersData: Array<{ id: number; name: string | null; avatar?: string | null }>;
  projectsData: Array<{ id: number; name: string; color?: string | null }>;
  timeData: ReturnType<typeof trpc.task.getTimeTracked.useQuery>["data"];
  trackedSeconds: number;
  liveSessionSeconds: number;
  isTimerRunning: boolean;
  isTimerPaused: boolean;
  hasActiveSession: boolean;
}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const chatInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const participantsRef = useRef<HTMLDivElement>(null);

  const [description, setDescription] = useState(task.description || "");
  const [editingDescription, setEditingDescription] = useState(false);
  const [showAddParticipant, setShowAddParticipant] = useState(false);
  const [participantToAdd, setParticipantToAdd] = useState<number | "">("");
  const [showAddObserver, setShowAddObserver] = useState(false);
  const [observerToAdd, setObserverToAdd] = useState<number | "">("");
  const [chatMessage, setChatMessage] = useState("");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [idCopied, setIdCopied] = useState(false);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [showTimeTracking, setShowTimeTracking] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showChatPanel, setShowChatPanel] = useState(true);
  const [showChatSearch, setShowChatSearch] = useState(false);
  const [chatSearch, setChatSearch] = useState("");
  const [isFollowing, setIsFollowing] = useState(() => readTaskPref(taskId, "following", true));
  const [isMuted, setIsMuted] = useState(() => readTaskPref(taskId, "muted", false));
  const [isFavorite, setIsFavorite] = useState(() => isTaskFavorite(taskId));
  const [showSubtaskDialog, setShowSubtaskDialog] = useState(false);
  const [subtaskTitle, setSubtaskTitle] = useState("");
  const [showMarketDialog, setShowMarketDialog] = useState(false);
  const [showAutomationDialog, setShowAutomationDialog] = useState(false);
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false);
  const [showDelegateDialog, setShowDelegateDialog] = useState(false);
  const [delegateUserId, setDelegateUserId] = useState<number | "">("");
  const [installedApps, setInstalledApps] = useState<string[]>(() =>
    readTaskPref(taskId, "market-apps", [] as string[]),
  );
  const [automationRules, setAutomationRules] = useState<Record<string, boolean>>(() =>
    readTaskPref(taskId, "automations", {} as Record<string, boolean>),
  );
  const [isDeferred, setIsDeferred] = useState(() => readTaskPref(taskId, "deferred", false));
  const [statusSelectKey, setStatusSelectKey] = useState(0);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  useEffect(() => {
    setIsDeferred(readTaskPref(taskId, "deferred", false));
  }, [taskId]);

  useEffect(() => {
    const onPrefs = (e: Event) => {
      const detail = (e as CustomEvent<{ taskId: number; key: string }>).detail;
      if (detail?.taskId === taskId && detail.key === "deferred") {
        setIsDeferred(readTaskPref(taskId, "deferred", false));
      }
    };
    window.addEventListener(TASK_PREFS_CHANGED_EVENT, onPrefs);
    return () => window.removeEventListener(TASK_PREFS_CHANGED_EVENT, onPrefs);
  }, [taskId]);

  const workflowState = resolveWorkflowState(task.status, isDeferred);
  const workflowTransitions = getWorkflowTransitions(workflowState);

  useEffect(() => {
    setDescription(task.description || "");
  }, [task.description]);

  useEffect(() => {
    setIsFollowing(readTaskPref(taskId, "following", true));
    setIsMuted(readTaskPref(taskId, "muted", false));
    setIsFavorite(isTaskFavorite(taskId));
    setInstalledApps(readTaskPref(taskId, "market-apps", [] as string[]));
    setAutomationRules(readTaskPref(taskId, "automations", {} as Record<string, boolean>));
  }, [taskId]);

  useEffect(() => {
    const onPrefsChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ taskId: number; key: string }>).detail;
      if (detail?.taskId !== taskId) return;
      if (detail.key === "favorite") setIsFavorite(isTaskFavorite(taskId));
      if (detail.key === "muted") setIsMuted(readTaskPref(taskId, "muted", false));
      if (detail.key === "following") setIsFollowing(readTaskPref(taskId, "following", true));
    };
    window.addEventListener(TASK_PREFS_CHANGED_EVENT, onPrefsChanged);
    return () => window.removeEventListener(TASK_PREFS_CHANGED_EVENT, onPrefsChanged);
  }, [taskId]);

  const showNotice = (message: string) => {
    setActionNotice(message);
    window.setTimeout(() => setActionNotice(null), 2500);
  };

  const updateMutation = trpc.task.update.useMutation({
    onSuccess: () => {
      utils.task.getById.invalidate({ id: taskId });
      utils.task.list.invalidate();
      invalidateProjectStats(utils, task.projectId);
      setEditingDescription(false);
    },
  });

  const startTimerMutation = trpc.task.startTimer.useMutation({
    onSuccess: () => {
      utils.task.getActiveTimer.invalidate({ taskId });
      utils.task.getById.invalidate({ id: taskId });
    },
  });

  const pauseTimerMutation = trpc.task.pauseTimer.useMutation({
    onSuccess: () => {
      utils.task.getActiveTimer.invalidate({ taskId });
      utils.task.getTimeTracked.invalidate({ taskId });
      utils.task.getById.invalidate({ id: taskId });
      utils.task.list.invalidate();
      utils.timeEntry.getStats.invalidate();
      utils.timeEntry.list.invalidate();
      utils.dashboard.getStats.invalidate();
    },
  });

  const stopTimerMutation = trpc.task.stopTimer.useMutation({
    onSuccess: () => {
      utils.task.getActiveTimer.invalidate({ taskId });
      utils.task.getTimeTracked.invalidate({ taskId });
      utils.task.getById.invalidate({ id: taskId });
      utils.task.list.invalidate();
      utils.timeEntry.getStats.invalidate();
      utils.timeEntry.list.invalidate();
      utils.dashboard.getStats.invalidate();
    },
  });

  const deleteMutation = trpc.task.delete.useMutation({
    onSuccess: () => {
      utils.task.list.invalidate();
      utils.task.getById.invalidate({ id: taskId });
      invalidateProjectStats(utils, task.projectId);
      setShowDeleteConfirm(false);
      onClose();
    },
  });

  const createSubtaskMutation = trpc.subtask.create.useMutation({
    onSuccess: () => {
      utils.task.getById.invalidate({ id: taskId });
      setShowSubtaskDialog(false);
      setSubtaskTitle("");
      showNotice("Subtask created");
    },
  });

  const addCommentMutation = trpc.task.addComment.useMutation({
    onSuccess: () => {
      utils.task.getById.invalidate({ id: taskId });
      setChatMessage("");
    },
  });

  const addParticipantMutation = trpc.task.addParticipant.useMutation({
    onSuccess: () => {
      utils.task.getById.invalidate({ id: taskId });
      setShowAddParticipant(false);
      setParticipantToAdd("");
    },
  });

  const removeParticipantMutation = trpc.task.removeParticipant.useMutation({
    onSuccess: () => utils.task.getById.invalidate({ id: taskId }),
  });

  const addObserverMutation = trpc.task.addObserver.useMutation({
    onSuccess: () => {
      utils.task.getById.invalidate({ id: taskId });
      setShowAddObserver(false);
      setObserverToAdd("");
    },
  });

  const removeObserverMutation = trpc.task.removeObserver.useMutation({
    onSuccess: () => utils.task.getById.invalidate({ id: taskId }),
  });

  const canCreate = canCreateTask(user);
  const isOwner = task.createdBy === user?.id;
  const canManage =
    user?.role === "admin" || user?.role === "manager" || isOwner || task.assigneeId === user?.id;
  const canChangeOwner = user?.role === "admin" || user?.role === "manager";
  const canManageParticipants = user?.role === "admin" || user?.role === "manager" || isOwner;
  const canDelete = user?.role === "admin" || user?.role === "manager" || isOwner;

  const existingParticipantIds = new Set(task.participants.map((p) => p.id));
  const existingObserverIds = new Set((task.observers ?? []).map((p) => p.id));
  const availableUsers = usersData.filter(
    (u) => !existingParticipantIds.has(u.id) && u.id !== task.assigneeId,
  );
  const availableObservers = usersData.filter(
    (u) =>
      !existingObserverIds.has(u.id) &&
      !existingParticipantIds.has(u.id) &&
      u.id !== task.assigneeId &&
      u.id !== task.createdBy,
  );

  const taskUrl = `${window.location.origin}/tasks?task=${taskId}&view=deadline`;

  const memberIds = new Set(
    [task.assigneeId, task.createdBy, ...task.participants.map((p) => p.id)].filter(
      (id): id is number => id != null,
    ),
  );
  const memberCount = memberIds.size;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(taskUrl);
      setLinkCopied(true);
      window.setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  const handleCopyId = async () => {
    try {
      await navigator.clipboard.writeText(String(task.id));
      setIdCopied(true);
      window.setTimeout(() => setIdCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  const taskOverdue = task.dueDate ? isTaskOverdue(task) : false;
  const descriptionText = getDisplayDescription(task.description);
  const isLongDescription = descriptionText.length > 280 || descriptionText.split("\n").length > 6;

  const handlePopOut = () => {
    window.open(taskUrl, "_blank", "noopener,noreferrer");
  };

  const handleToggleUrgent = () => {
    const next = task.priority === "urgent" ? "medium" : "urgent";
    updateMutation.mutate({ id: taskId, priority: next });
  };

  const handleCloneTask = () => {
    tryOpenCreateTask(user, () => {
      setTaskCreatePrefill({
        mode: "clone",
        sourceTitle: task.title,
        form: {
          title: task.title,
          description: task.description ?? "",
          priority: task.priority as "low" | "medium" | "high" | "urgent",
          assigneeId: task.assigneeId ?? undefined,
          ownerId: task.createdBy ?? undefined,
          projectId: task.projectId ?? undefined,
          dueDate: toDateTimeLocalValue(task.dueDate),
          estimatedHours: task.estimatedHours ? String(task.estimatedHours) : "",
          participantIds: task.participants.map((p) => p.id),
          observerIds: (task.observers ?? []).map((o) => o.id),
        },
      });
      setMenuOpen(false);
      onClose();
      navigate("/tasks?create=true&from=clone");
    });
  };

  const handleOpenCreateTask = () => {
    tryOpenCreateTask(user, () => {
      setMenuOpen(false);
      onClose();
      navigate("/tasks?create=true");
    });
  };

  const handleCreateFromTemplate = () => {
    tryOpenCreateTask(user, () => {
      setTaskCreatePrefill({
        mode: "template",
        sourceTitle: task.title,
        form: {
          title: `${task.title} (template)`,
          description: task.description ?? "",
          priority: task.priority as "low" | "medium" | "high" | "urgent",
          projectId: task.projectId ?? undefined,
        },
      });
      setMenuOpen(false);
      onClose();
      navigate("/tasks?create=true&from=template");
    });
  };

  const handleCreateSubtask = () => {
    const title = subtaskTitle.trim();
    if (!title) return;
    createSubtaskMutation.mutate({ taskId, title });
  };

  const handleToggleFavorite = () => {
    const next = !isFavorite;
    setTaskFavorite(taskId, next);
    setIsFavorite(next);
    showNotice(next ? "Added to favorites" : "Removed from favorites");
    setMenuOpen(false);
  };

  const handleToggleFollow = () => {
    const next = !isFollowing;
    setIsFollowing(next);
    writeTaskPref(taskId, "following", next);
    showNotice(next ? "Following task" : "Unfollowed task");
    setMenuOpen(false);
  };

  const handleToggleMute = () => {
    const next = !isMuted;
    setIsMuted(next);
    writeTaskPref(taskId, "muted", next);
    showNotice(next ? "Notifications muted" : "Notifications unmuted");
    setMenuOpen(false);
  };

  const handleInstallApp = (appId: string, appName: string) => {
    if (installedApps.includes(appId)) {
      showNotice(`${appName} is already installed`);
      return;
    }
    const next = [...installedApps, appId];
    setInstalledApps(next);
    writeTaskPref(taskId, "market-apps", next);
    showNotice(`${appName} installed for this task`);
  };

  const handleToggleAutomation = (ruleId: string, enabled: boolean) => {
    const next = { ...automationRules, [ruleId]: enabled };
    setAutomationRules(next);
    writeTaskPref(taskId, "automations", next);
    const rule = AUTOMATION_RULES.find((r) => r.id === ruleId);
    showNotice(enabled ? `Enabled: ${rule?.label}` : `Disabled: ${rule?.label}`);
  };

  const handleAddMember = () => {
    setShowAddParticipant(true);
    setShowChatPanel(true);
    window.setTimeout(() => participantsRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 100);
  };


  const handleWorkflowChange = (next: WorkflowState) => {
    const { status, deferred } = workflowStateToDb(next);
    writeTaskPref(taskId, "deferred", deferred);
    setIsDeferred(deferred);

    if (next === "deferred") {
      const base = task.dueDate ? new Date(task.dueDate) : new Date();
      base.setDate(base.getDate() + 1);
      if (isTimerRunning) {
        pauseTimerMutation.mutate({ taskId });
      }
      updateMutation.mutate({
        id: taskId,
        status,
        dueDate: base.toISOString(),
      });
      showNotice("Task deferred by 1 day");
    } else if (next === "complete") {
      handleComplete();
    } else if (next === "paused" && isTimerRunning) {
      pauseTimerMutation.mutate({ taskId });
      updateMutation.mutate({ id: taskId, status });
      showNotice("Task paused");
    } else {
      updateMutation.mutate({ id: taskId, status });
      if (next === "in_progress") {
        const resuming = workflowState === "deferred" || workflowState === "paused";
        showNotice(resuming ? "Task resumed" : "Task in progress");
      } else if (next === "paused") {
        showNotice("Task paused");
      }
    }

    setStatusSelectKey((k) => k + 1);
  };

  const handleStageChange = (stage: ProjectPipelineStageKey) => {
    updateMutation.mutate({ id: taskId, stage });
    setStatusSelectKey((k) => k + 1);
    showNotice(`Moved to ${kanbanStageLabel(stage)}`);
  };

  const handleResumeTask = () => {
    writeTaskPref(taskId, "deferred", false);
    setIsDeferred(false);
    updateMutation.mutate(
      { id: taskId, status: "in_progress" },
      {
        onSuccess: () => {
          startTimerMutation.mutate({ taskId });
          showNotice("Task resumed");
        },
      },
    );
  };

  const handleDelegate = () => {
    setDelegateUserId(task.assigneeId ?? "");
    setActionsMenuOpen(false);
    setShowDelegateDialog(true);
  };

  const handleConfirmDelegate = () => {
    if (!delegateUserId) return;
    updateMutation.mutate(
      { id: taskId, assigneeId: delegateUserId as number },
      {
        onSuccess: () => {
          setShowDelegateDialog(false);
          setDelegateUserId("");
          showNotice("Task delegated");
        },
      },
    );
  };

  const handleComplete = () => {
    writeTaskPref(taskId, "deferred", false);
    setIsDeferred(false);
    if (hasActiveSession) {
      stopTimerMutation.mutate(
        { taskId },
        { onSuccess: () => updateMutation.mutate({ id: taskId, status: "done" }) },
      );
    } else {
      updateMutation.mutate({ id: taskId, status: "done" });
    }
  };

  const handleSendComment = (text?: string) => {
    const message = (text ?? chatMessage).trim();
    if (!message) return;
    addCommentMutation.mutate({ taskId, message });
  };

  const handleFileAttach = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    handleSendComment(`📎 Attached file: ${file.name}`);
    e.target.value = "";
  };

  const activityMessage = (action: string, oldValue?: string | null, newValue?: string | null) => {
    switch (action) {
      case "created": return "created this task";
      case "status_changed":
        return `changed status from ${oldValue?.replace("_", " ") ?? "—"} to ${newValue?.replace("_", " ") ?? "—"}`;
      case "assigned":
        return `changed assignee from ${oldValue ?? "—"} to ${newValue ?? "—"}`;
      case "participant_added": return `added participant ${newValue ?? ""}`;
      case "observer_added": return `added observer ${newValue ?? ""}`;
      case "time_logged":
        if (newValue === "started timer") return "started the timer";
        if (newValue === "paused timer") return "paused the timer";
        if (newValue === "resumed timer") return "resumed the timer";
        return `logged time: ${newValue ?? ""}`;
      case "commented": return newValue ?? "commented";
      default: return action.replace("_", " ");
    }
  };

  const filteredActivities = [...task.activities].reverse().filter((activity) => {
    if (!chatSearch.trim()) return true;
    const q = chatSearch.toLowerCase();
    const text = activity.action === "commented"
      ? (activity.newValue ?? "")
      : activityMessage(activity.action, activity.oldValue, activity.newValue);
    return text.toLowerCase().includes(q) || (activity.user?.name ?? "").toLowerCase().includes(q);
  });

  return (
    <>
      <div className="flex flex-1 min-w-0 flex-col lg:flex-row">
        {/* Task details */}
        <div className={`relative w-full min-w-0 flex flex-col bg-white border-r border-gray-200 ${showChatPanel ? "lg:w-[44%]" : "flex-1"}`}>
          <div className="absolute top-24 left-0 z-20 flex flex-col gap-1 pointer-events-auto">
            <EdgeTabButton icon={X} label="Close" onClick={onClose} />
            <EdgeTabButton
              icon={Link2}
              label={linkCopied ? "Copied!" : "Copy link"}
              onClick={handleCopyLink}
              active={linkCopied}
            />
            <EdgeTabButton icon={ExternalLink} label="Open in new tab" onClick={handlePopOut} />
          </div>
          {actionNotice && (
            <div className="shrink-0 px-6 py-2 bg-blue-50 border-b border-blue-100 text-xs font-medium text-[#2563EB]">
              {actionNotice}
            </div>
          )}
          <div className="flex-1 overflow-y-auto">
            <div className="p-6 space-y-4">
            {/* Section 1: Title (outside card) + description card */}
            <section>
              <div className="flex items-center justify-between gap-3 mb-3">
                <input
                  type="text"
                  value={task.title}
                  readOnly
                  aria-readonly="true"
                  tabIndex={-1}
                  className="flex-1 text-xl font-semibold text-[#1F2937] leading-tight border-0 outline-none bg-transparent cursor-default focus:ring-0"
                />
                <div className="flex items-center gap-0.5 shrink-0">
                  {isFavorite && (
                    <HeaderIconButton
                      icon={Star}
                      label="Remove from favorites"
                      onClick={handleToggleFavorite}
                      active
                      activeClassName="text-amber-500 bg-amber-50 hover:bg-amber-100"
                    />
                  )}
                  {isMuted && (
                    <HeaderIconButton
                      icon={VolumeX}
                      label="Unmute notifications"
                      onClick={handleToggleMute}
                      active
                      activeClassName="text-gray-600 bg-gray-100 hover:bg-gray-200"
                    />
                  )}
                  <HeaderIconButton
                    icon={Flame}
                    label={task.priority === "urgent" ? "Remove urgent" : "Mark urgent"}
                    onClick={handleToggleUrgent}
                    active={task.priority === "urgent"}
                    activeClassName="text-orange-500 bg-orange-50 hover:bg-orange-100"
                  />
                  <Popover open={menuOpen} onOpenChange={setMenuOpen}>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className={`w-9 h-9 flex items-center justify-center rounded-lg transition-colors ${
                          menuOpen
                            ? "bg-gray-100 text-gray-800"
                            : "text-gray-500 hover:bg-gray-100 hover:text-gray-800"
                        }`}
                        aria-label="Task menu"
                        title="Task menu"
                      >
                        <Menu size={18} />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent
                      align="end"
                      sideOffset={8}
                      className="z-[130] w-[300px] p-3 rounded-2xl border border-gray-200 shadow-xl bg-white"
                    >
                      <div className="grid grid-cols-3 gap-2 pb-3 border-b border-gray-100">
                        <MenuQuickAction
                          icon={EyeOff}
                          label={isFollowing ? "Unfollow" : "Follow"}
                          onClick={handleToggleFollow}
                        />
                        <MenuQuickAction
                          icon={isMuted ? Volume2 : VolumeX}
                          label={isMuted ? "Unmute" : "Mute"}
                          onClick={handleToggleMute}
                        />
                        <MenuQuickAction
                          icon={Link2}
                          label={linkCopied ? "Copied!" : "Copy link"}
                          onClick={() => {
                            void handleCopyLink();
                            setMenuOpen(false);
                          }}
                        />
                      </div>
                      <div className="py-1">
                        {canCreate ? (
                          <>
                            <MenuListItem icon={CheckSquare} label="Create task" onClick={handleOpenCreateTask} />
                            <MenuListItem
                              icon={CopyPlus}
                              label="Clone task"
                              onClick={handleCloneTask}
                            />
                            <MenuListItem
                              icon={LayoutTemplate}
                              label="Create using template"
                              onClick={handleCreateFromTemplate}
                            />
                          </>
                        ) : null}
                        <MenuListItem
                          icon={ListTree}
                          label="Create subtask"
                          onClick={() => {
                            setMenuOpen(false);
                            setShowSubtaskDialog(true);
                          }}
                        />
                        <MenuListItem
                          icon={Star}
                          label={isFavorite ? "Remove from Favorites" : "Add to Favorites"}
                          onClick={handleToggleFavorite}
                          active={isFavorite}
                        />
                      </div>
                      <div className="border-t border-gray-100 py-1 mt-1">
                        <MenuListItem
                          icon={Store}
                          label="Market"
                          onClick={() => {
                            setMenuOpen(false);
                            setShowMarketDialog(true);
                          }}
                        />
                        <MenuListItem
                          icon={Bot}
                          label="Automation"
                          onClick={() => {
                            setMenuOpen(false);
                            setShowAutomationDialog(true);
                          }}
                        />
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
              <div className="px-4 py-3">
                {editingDescription ? (
                  <div className="space-y-3">
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      className="w-full min-h-[7rem] text-sm text-gray-700 border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 resize-y"
                      autoFocus
                      placeholder="Add a description..."
                    />
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          updateMutation.mutate({ id: taskId, description });
                          setEditingDescription(false);
                        }}
                        className="h-8 px-3.5 bg-[#2563EB] text-white rounded-lg text-xs font-medium hover:bg-[#1D4ED8] transition-colors"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDescription(task.description || "");
                          setEditingDescription(false);
                        }}
                        className="h-8 px-3.5 border border-gray-200 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p
                      className={`text-sm text-gray-600 leading-relaxed whitespace-pre-wrap ${
                        !descriptionExpanded && isLongDescription ? "line-clamp-5" : ""
                      } ${!descriptionText ? "text-gray-400 italic" : ""}`}
                    >
                      {descriptionText || "No description yet."}
                    </p>
                    <div className="flex items-center gap-4 mt-3 pt-3 border-t border-gray-100">
                      <button
                        type="button"
                        onClick={() => setEditingDescription(true)}
                        className="text-xs font-medium text-[#2563EB] hover:text-[#1D4ED8] transition-colors"
                      >
                        Edit
                      </button>
                      {isLongDescription && (
                        <button
                          type="button"
                          onClick={() => setDescriptionExpanded((v) => !v)}
                          className="text-xs font-medium text-[#2563EB] hover:text-[#1D4ED8] transition-colors"
                        >
                          {descriptionExpanded ? "Collapse" : "Expand"}
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
              </div>
            </section>

            <TaskFilesSection taskId={taskId} canManage={canManage} />

            {/* Section 2: Task metadata */}
            <section className="rounded-xl border border-gray-200 bg-white overflow-visible">
            <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100 rounded-t-xl">
              <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Task details</span>
            </div>
            <div className="px-4 py-1 text-sm">
              <MetaRow label="Task owner" icon={User}>
                {canChangeOwner ? (
                  <select
                    value={task.createdBy ?? ""}
                    onChange={(e) =>
                      updateMutation.mutate({
                        id: taskId,
                        createdBy: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                    className={META_SELECT_CLASS}
                  >
                    <option value="">Unknown</option>
                    {usersData.map((u) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                ) : (
                  <div className="inline-flex h-9 items-center">
                    <UserChip name={task.creator?.name} avatar={task.creator?.avatar} />
                  </div>
                )}
              </MetaRow>

              <MetaRow label="Assignees" icon={Users}>
                {canManage ? (
                  <select
                    value={task.assigneeId ?? ""}
                    onChange={(e) =>
                      updateMutation.mutate({
                        id: taskId,
                        assigneeId: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                    className={META_SELECT_CLASS}
                  >
                    <option value="">Unassigned</option>
                    {usersData.map((u) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                ) : (
                  <div className="inline-flex h-9 items-center">
                    <UserChip name={task.assignee?.name} avatar={task.assignee?.avatar} />
                  </div>
                )}
              </MetaRow>

              <MetaRow label="Deadline" icon={Clock}>
                {canManage ? (
                  <input
                    type="datetime-local"
                    value={toDateTimeLocalValue(task.dueDate)}
                    onChange={(e) =>
                      updateMutation.mutate({
                        id: taskId,
                        dueDate: e.target.value ? new Date(e.target.value).toISOString() : null,
                      })
                    }
                    className={cn(
                      META_DATETIME_CLASS,
                      taskOverdue && "border-red-200 text-red-600",
                    )}
                  />
                ) : (
                  <span
                    className={cn(
                      "inline-flex h-9 items-center text-sm",
                      taskOverdue ? "text-red-600 font-medium" : "text-gray-800",
                    )}
                  >
                    {task.dueDate ? formatDueLabel(task.dueDate) : "No deadline"}
                  </span>
                )}
              </MetaRow>
              {taskOverdue && task.dueDate && (
                <div className="grid grid-cols-[16px_6.75rem_minmax(0,1fr)] gap-x-3 -mt-1 pb-2 border-b border-gray-100">
                  <span />
                  <span />
                  <span className="inline-flex w-fit items-center rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-600">
                    {formatOverdueLabel(task.dueDate)}
                  </span>
                </div>
              )}

              <MetaRow label="Time tracking" icon={Clock}>
                <div className="inline-flex items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1.5 font-mono font-semibold tabular-nums ${
                      isTimerRunning ? "text-[#2563EB]" : "text-[#1F2937]"
                    }`}
                  >
                    <Clock
                      size={14}
                      className={isTimerRunning ? "text-[#2563EB] animate-pulse" : "text-gray-400"}
                    />
                    {formatElapsedHMS(trackedSeconds)}
                    {isTimerRunning && (
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-[#2563EB] bg-blue-50 px-1.5 py-0.5 rounded">
                        Live
                      </span>
                    )}
                    {isTimerPaused && hasActiveSession && (
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                        Paused
                      </span>
                    )}
                  </span>
                  <Popover open={showTimeTracking} onOpenChange={setShowTimeTracking}>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="inline-flex items-center justify-center h-7 w-7 rounded-md text-gray-400 hover:text-[#2563EB] hover:bg-gray-50 transition-colors"
                        aria-label={showTimeTracking ? "Hide time history" : "Show time history"}
                        aria-expanded={showTimeTracking}
                      >
                        {showTimeTracking ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent
                      align="start"
                      side="bottom"
                      sideOffset={6}
                      className="z-[140] w-[min(22rem,calc(100vw-3rem))] p-3 rounded-xl shadow-lg"
                    >
                      <div className="space-y-2">
                        {hasActiveSession && (
                          <div className="flex items-center justify-between text-sm bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                            <span className="text-gray-600">Current session</span>
                            <span className={`font-mono font-semibold tabular-nums ${isTimerRunning ? "text-[#2563EB]" : "text-gray-700"}`}>
                              {formatElapsedHMS(liveSessionSeconds)}
                            </span>
                          </div>
                        )}
                        <TaskTimeLoggedSection
                          taskId={taskId}
                          timeData={timeData}
                          hasActiveSession={hasActiveSession}
                          canManageTime={canManage}
                          currentUserId={user?.id ?? 0}
                          canPickUser={user?.role === "admin" || user?.role === "manager"}
                          users={usersData}
                        />
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
              </MetaRow>

              <MetaRow label="Status" icon={Play}>
                {canManage ? (
                  workflowState === "complete" ? (
                    <span className="inline-flex h-9 items-center rounded-full bg-emerald-50 px-3 text-sm font-medium text-emerald-700">
                      {workflowLabel(workflowState)}
                    </span>
                  ) : (
                    <select
                      key={statusSelectKey}
                      defaultValue=""
                      onChange={(e) => {
                        const value = e.target.value as WorkflowState;
                        if (value) handleWorkflowChange(value);
                      }}
                      className={META_SELECT_CLASS}
                    >
                      <option value="" disabled>
                        {workflowLabel(workflowState)}
                      </option>
                      {workflowTransitions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  )
                ) : (
                  <div className="inline-flex h-9 items-center">
                    <WorkflowStatusChip state={workflowState} />
                  </div>
                )}
              </MetaRow>

              <MetaRow label="Created" icon={Calendar}>
                <div className="inline-flex h-9 items-center gap-2 min-w-0 max-w-full flex-wrap">
                  <span className="text-sm text-gray-800 truncate leading-none">
                    {formatTaskDateTime(task.createdAt)}
                    {task.creator?.name ? (
                      <>
                        <span className="text-gray-400"> · </span>
                        <span className="font-medium">{task.creator.name}</span>
                      </>
                    ) : null}
                    <span className="text-gray-400"> / </span>
                    ID: {task.id}
                  </span>
                  <button
                    type="button"
                    onClick={() => void handleCopyId()}
                    className="shrink-0 inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-400 hover:text-[#2563EB] hover:bg-gray-100 transition-colors"
                    aria-label="Copy task ID"
                    title={idCopied ? "Copied!" : "Copy task ID"}
                  >
                    <Copy size={14} />
                  </button>
                </div>
              </MetaRow>
            </div>
            </section>

            {/* Section 3: Project */}
            <section className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            <div className="px-4 py-1 text-sm">
              <MetaRow label="Project" icon={Folder}>
                {canManage ? (
                  <select
                    value={task.projectId ?? ""}
                    onChange={(e) =>
                      updateMutation.mutate({
                        id: taskId,
                        projectId: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                    className={META_SELECT_CLASS}
                  >
                    <option value="">No project</option>
                    {projectsData.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                ) : task.project ? (
                  <span className="inline-flex h-9 items-center gap-2 text-sm text-gray-800 font-medium">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: task.project.color ?? "#2563EB" }}
                    />
                    {task.project.name}
                  </span>
                ) : (
                  <span className="inline-flex h-9 items-center text-sm text-gray-400">No project</span>
                )}
              </MetaRow>

              <MetaRow label="Stage" icon={LayoutGrid}>
                {canManage ? (
                  <select
                    value={taskPipelineStage(task)}
                    onChange={(e) => handleStageChange(e.target.value as ProjectPipelineStageKey)}
                    className={cn(
                      META_SELECT_CLASS,
                      "rounded-full border-blue-100 bg-blue-50 text-[#2563EB] font-medium",
                    )}
                  >
                    {KANBAN_STAGES.map((stage) => (
                      <option key={stage.key} value={stage.key}>
                        {stage.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="inline-flex h-9 items-center gap-2 rounded-full bg-blue-50 px-3 text-sm font-medium text-[#2563EB]">
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: kanbanStageColor(taskPipelineStage(task)) }}
                    />
                    {kanbanStageLabel(taskPipelineStage(task))}
                  </span>
                )}
              </MetaRow>
            </div>
            </section>

            {/* Section 4: Participants & observers */}
            <section ref={participantsRef} className="rounded-xl border border-gray-200 bg-white overflow-hidden p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Participants</span>
                {canManageParticipants && (
                  <button
                    type="button"
                    onClick={() => setShowAddParticipant(!showAddParticipant)}
                    className="text-xs text-[#2563EB] font-medium flex items-center gap-1"
                  >
                    <Plus size={12} /> Add
                  </button>
                )}
              </div>
              {showAddParticipant && (
                <div className="flex gap-2 mb-2">
                  <select
                    value={participantToAdd}
                    onChange={(e) => setParticipantToAdd(e.target.value ? Number(e.target.value) : "")}
                    className="flex-1 h-8 text-sm border border-gray-200 rounded-md px-2"
                  >
                    <option value="">Select person...</option>
                    {availableUsers.map((u) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={!participantToAdd}
                    onClick={() =>
                      participantToAdd &&
                      addParticipantMutation.mutate({ taskId, userId: participantToAdd as number })
                    }
                    className="h-8 px-3 bg-[#2563EB] text-white rounded-md text-xs font-medium disabled:opacity-50"
                  >
                    Add
                  </button>
                </div>
              )}
              <div className="space-y-1.5">
                {task.participants.map((p) => (
                  <div key={p.id} className="flex items-center justify-between">
                    <UserChip name={p.name} avatar={p.avatar} />
                    {canManageParticipants && (
                      <button
                        type="button"
                        onClick={() => removeParticipantMutation.mutate({ taskId, userId: p.id })}
                        className="text-xs text-gray-400 hover:text-blue-600"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))}
                {task.participants.length === 0 && (
                  <p className="text-sm text-gray-400">No participants</p>
                )}
              </div>

            <div className="mt-5 pt-5 border-t border-gray-100">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Observers</span>
                {canManageParticipants && (
                  <button
                    type="button"
                    onClick={() => setShowAddObserver(!showAddObserver)}
                    className="text-xs text-[#2563EB] font-medium flex items-center gap-1"
                  >
                    <Plus size={12} /> Add
                  </button>
                )}
              </div>
              <p className="text-xs text-gray-400 mb-2">
                Former assignees are added automatically when you reassign a task.
              </p>
              {showAddObserver && (
                <div className="flex gap-2 mb-2">
                  <select
                    value={observerToAdd}
                    onChange={(e) => setObserverToAdd(e.target.value ? Number(e.target.value) : "")}
                    className="flex-1 h-8 text-sm border border-gray-200 rounded-md px-2"
                  >
                    <option value="">Select observer...</option>
                    {availableObservers.map((u) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={!observerToAdd}
                    onClick={() =>
                      observerToAdd &&
                      addObserverMutation.mutate({ taskId, userId: observerToAdd as number })
                    }
                    className="h-8 px-3 bg-[#2563EB] text-white rounded-md text-xs font-medium disabled:opacity-50"
                  >
                    Add
                  </button>
                </div>
              )}
              <div className="space-y-1.5">
                {(task.observers ?? []).map((o) => (
                  <div key={o.id} className="flex items-center justify-between">
                    <UserChip name={o.name} avatar={o.avatar} />
                    {canManageParticipants && (
                      <button
                        type="button"
                        onClick={() => removeObserverMutation.mutate({ taskId, userId: o.id })}
                        className="text-xs text-gray-400 hover:text-blue-600"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))}
                {(task.observers ?? []).length === 0 && (
                  <p className="text-sm text-gray-400">No observers</p>
                )}
              </div>
            </div>
            </section>
            </div>
          </div>

          {/* Bottom Start / Complete — always visible */}
          {canManage && workflowState !== "complete" && (
            <div className="shrink-0 border-t border-gray-200 px-4 py-3 bg-white">
              {hasActiveSession && workflowState !== "deferred" && (
                <div className="flex items-center justify-center gap-2 mb-2 font-mono text-base font-semibold tabular-nums text-[#2563EB]">
                  <Clock size={16} className={isTimerRunning ? "animate-pulse" : ""} />
                  {formatElapsedHMS(trackedSeconds)}
                  <span className="text-[11px] font-medium text-gray-500 font-sans">
                    {isTimerRunning ? "tracking…" : "paused"}
                  </span>
                </div>
              )}
              <div className="flex items-center gap-2">
                {workflowState === "deferred" ? (
                  <button
                    type="button"
                    onClick={handleResumeTask}
                    disabled={updateMutation.isPending || startTimerMutation.isPending}
                    className="h-9 px-4 inline-flex items-center justify-center gap-1.5 bg-[#2563EB] text-white rounded-lg text-sm font-medium hover:bg-[#1D4ED8] disabled:opacity-50"
                  >
                    {(updateMutation.isPending || startTimerMutation.isPending) ? (
                      <Loader2 size={15} className="animate-spin" />
                    ) : (
                      <Play size={15} />
                    )}
                    Resume task
                  </button>
                ) : isTimerRunning ? (
                  <button
                    type="button"
                    onClick={() => pauseTimerMutation.mutate({ taskId })}
                    disabled={pauseTimerMutation.isPending}
                    className="h-9 px-4 inline-flex items-center justify-center gap-1.5 bg-[#F59E0B] text-white rounded-lg text-sm font-medium hover:bg-[#D97706] disabled:opacity-50"
                  >
                    {pauseTimerMutation.isPending ? <Loader2 size={15} className="animate-spin" /> : <Pause size={15} />}
                    Pause
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      if (workflowState === "not_started" || workflowState === "paused") {
                        handleWorkflowChange("in_progress");
                      }
                      startTimerMutation.mutate({ taskId });
                    }}
                    disabled={startTimerMutation.isPending}
                    className="h-9 px-4 inline-flex items-center justify-center gap-1.5 bg-[#2563EB] text-white rounded-lg text-sm font-medium hover:bg-[#1D4ED8] disabled:opacity-50"
                  >
                    {startTimerMutation.isPending ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />}
                    {isTimerPaused ? "Resume" : "Start"}
                  </button>
                )}
                {workflowState !== "deferred" && (
                  <button
                    type="button"
                    onClick={handleComplete}
                    disabled={updateMutation.isPending || stopTimerMutation.isPending}
                    className="h-9 px-4 inline-flex items-center justify-center border border-gray-300 bg-white text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
                  >
                    Complete
                  </button>
                )}
                <Popover open={actionsMenuOpen} onOpenChange={setActionsMenuOpen}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="h-9 w-9 inline-flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
                      aria-label="More actions"
                      title="More actions"
                    >
                      <MoreHorizontal size={18} />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="end" side="top" sideOffset={8} className="z-[130] w-44 p-1.5 rounded-xl">
                    <ActionMenuItem icon={UserPlus} label="Delegate" onClick={handleDelegate} />
                    {canDelete && (
                      <ActionMenuItem
                        icon={Trash2}
                        label="Delete"
                        destructive
                        onClick={() => {
                          setActionsMenuOpen(false);
                          setShowDeleteConfirm(true);
                        }}
                      />
                    )}
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          )}
        </div>

        {/* Task chat */}
        {showChatPanel && (
        <div className="flex-1 flex flex-col min-w-0 min-h-0 bg-[#E8F0FE]">
          <div className="px-5 py-3 bg-white/80 border-b border-gray-200 shrink-0">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-semibold text-[#1F2937]">Task chat</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  {memberCount} member{memberCount === 1 ? "" : "s"}
                  {isMuted && " · Muted"}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <HeaderIconButton
                  icon={UserPlus}
                  label="Add member"
                  onClick={handleAddMember}
                />
                <HeaderIconButton
                  icon={Search}
                  label="Search chat"
                  onClick={() => setShowChatSearch((v) => !v)}
                  active={showChatSearch}
                />
                <HeaderIconButton
                  icon={PanelRightClose}
                  label="Hide chat panel"
                  onClick={() => setShowChatPanel(false)}
                />
              </div>
            </div>
            {showChatSearch && (
              <div className="mt-3 relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={chatSearch}
                  onChange={(e) => setChatSearch(e.target.value)}
                  placeholder="Search messages..."
                  className="w-full h-9 pl-9 pr-3 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
                  autoFocus
                />
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {filteredActivities.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-8">No messages found.</p>
            ) : (
            filteredActivities.map((activity) => {
              const isSystem = ["created", "time_logged", "status_changed", "assigned", "participant_added", "observer_added"].includes(activity.action);
              const isComment = activity.action === "commented";
              return (
                <div
                  key={activity.id}
                  className={`rounded-xl px-4 py-3 text-sm max-w-[90%] ${
                    isComment
                      ? "bg-white border border-gray-200 text-gray-800 ml-auto"
                      : isSystem
                        ? "bg-white/70 border border-blue-100 text-blue-900"
                        : "bg-white border border-gray-200 text-gray-700"
                  }`}
                >
                  <p className="font-semibold text-xs text-gray-500 mb-1">{activity.user?.name ?? "System"}</p>
                  {isComment ? (
                    <p>{activity.newValue}</p>
                  ) : (
                    <p>{activityMessage(activity.action, activity.oldValue, activity.newValue)}</p>
                  )}
                  <p className="text-[10px] text-gray-400 mt-1">{formatTimeAgo(activity.createdAt)}</p>
                </div>
              );
            })
            )}
          </div>

          {/* Chat composer */}
          <div className="shrink-0 bg-white border-t border-gray-200 p-3">
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={handleFileAttach}
            />
            <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-xl px-2 py-1.5">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-200 hover:text-gray-700 shrink-0"
                aria-label="Attach file"
              >
                <Paperclip size={18} />
              </button>

              <input
                ref={chatInputRef}
                type="text"
                value={chatMessage}
                onChange={(e) => setChatMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSendComment();
                  }
                }}
                placeholder="Write a message..."
                className="flex-1 min-w-0 h-9 px-2 text-sm bg-transparent focus:outline-none"
              />

              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowEmojiPicker((v) => !v)}
                  className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-200 shrink-0"
                  aria-label="Emoji"
                >
                  <Smile size={18} />
                </button>
                {showEmojiPicker && (
                  <div className="absolute bottom-full right-0 mb-2 p-2 bg-white border border-gray-200 rounded-xl shadow-lg flex gap-1 z-10">
                    {QUICK_EMOJIS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        className="w-8 h-8 hover:bg-gray-100 rounded text-lg"
                        onClick={() => {
                          setChatMessage((m) => m + emoji);
                          setShowEmojiPicker(false);
                          chatInputRef.current?.focus();
                        }}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <button
                type="button"
                className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-200 shrink-0"
                aria-label="More actions"
                title="More actions"
              >
                <LayoutGrid size={18} />
              </button>

              <button
                type="button"
                onClick={() => handleSendComment("🎤 Voice note (demo)")}
                className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-200 shrink-0"
                aria-label="Voice message"
                title="Voice message"
              >
                <Mic size={18} />
              </button>

              <button
                type="button"
                onClick={() => handleSendComment()}
                disabled={!chatMessage.trim() || addCommentMutation.isPending}
                className="w-9 h-9 flex items-center justify-center rounded-lg bg-[#2563EB] text-white hover:bg-[#1D4ED8] disabled:opacity-40 shrink-0"
                aria-label="Send"
              >
                {addCommentMutation.isPending ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Send size={16} />
                )}
              </button>
            </div>
          </div>
        </div>
        )}

        {!showChatPanel && (
          <button
            type="button"
            onClick={() => setShowChatPanel(true)}
            className="shrink-0 w-12 border-l border-gray-200 bg-white hover:bg-gray-50 flex flex-col items-center justify-center gap-2 text-gray-500 hover:text-[#2563EB] transition-colors"
            title="Show chat panel"
            aria-label="Show chat panel"
          >
            <PanelRightOpen size={18} />
            <span className="text-[10px] font-medium [writing-mode:vertical-rl] rotate-180">Chat</span>
          </button>
        )}
      </div>

      <Dialog open={showDelegateDialog} onOpenChange={setShowDelegateDialog}>
        <DialogContent className="z-[130] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delegate task</DialogTitle>
            <DialogDescription>Choose who should take over this task.</DialogDescription>
          </DialogHeader>
          <select
            value={delegateUserId}
            onChange={(e) => setDelegateUserId(e.target.value ? Number(e.target.value) : "")}
            className="w-full h-10 px-3 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
          >
            <option value="">Select assignee...</option>
            {usersData.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
          <DialogFooter>
            <button
              type="button"
              onClick={() => {
                setShowDelegateDialog(false);
                setDelegateUserId("");
              }}
              className="h-9 px-4 border border-gray-200 rounded-lg text-sm text-gray-600"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmDelegate}
              disabled={!delegateUserId || updateMutation.isPending}
              className="h-9 px-4 bg-[#2563EB] text-white rounded-lg text-sm font-medium disabled:opacity-50"
            >
              {updateMutation.isPending ? "Delegating…" : "Delegate"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showSubtaskDialog} onOpenChange={setShowSubtaskDialog}>
        <DialogContent className="z-[130] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create subtask</DialogTitle>
            <DialogDescription>Add a subtask under &ldquo;{task.title}&rdquo;.</DialogDescription>
          </DialogHeader>
          <input
            type="text"
            value={subtaskTitle}
            onChange={(e) => setSubtaskTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreateSubtask();
            }}
            placeholder="Subtask title"
            className="w-full h-10 px-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
            autoFocus
          />
          <DialogFooter>
            <button
              type="button"
              onClick={() => {
                setShowSubtaskDialog(false);
                setSubtaskTitle("");
              }}
              className="h-9 px-4 border border-gray-200 rounded-lg text-sm text-gray-600"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleCreateSubtask}
              disabled={!subtaskTitle.trim() || createSubtaskMutation.isPending}
              className="h-9 px-4 bg-[#2563EB] text-white rounded-lg text-sm font-medium disabled:opacity-50"
            >
              {createSubtaskMutation.isPending ? "Creating…" : "Create subtask"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showMarketDialog} onOpenChange={setShowMarketDialog}>
        <DialogContent className="z-[130] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Market</DialogTitle>
            <DialogDescription>Install apps and integrations for this task.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-[360px] overflow-y-auto">
            {MARKET_APPS.map((app) => {
              const installed = installedApps.includes(app.id);
              return (
                <div
                  key={app.id}
                  className="flex items-center justify-between gap-3 p-3 border border-gray-200 rounded-xl"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-800">{app.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{app.description}</p>
                  </div>
                  <button
                    type="button"
                    disabled={installed}
                    onClick={() => handleInstallApp(app.id, app.name)}
                    className={`shrink-0 h-8 px-3 rounded-lg text-xs font-medium ${
                      installed
                        ? "bg-green-50 text-green-700 border border-green-200"
                        : "bg-[#2563EB] text-white hover:bg-[#1D4ED8]"
                    }`}
                  >
                    {installed ? "Installed" : "Install"}
                  </button>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showAutomationDialog} onOpenChange={setShowAutomationDialog}>
        <DialogContent className="z-[130] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Automation</DialogTitle>
            <DialogDescription>Configure rules that run automatically for this task.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {AUTOMATION_RULES.map((rule) => {
              const enabled = !!automationRules[rule.id];
              return (
                <label
                  key={rule.id}
                  className="flex items-center justify-between gap-3 p-3 border border-gray-200 rounded-xl cursor-pointer hover:bg-gray-50"
                >
                  <span className="text-sm text-gray-700">{rule.label}</span>
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(e) => handleToggleAutomation(rule.id, e.target.checked)}
                    className="w-4 h-4 accent-[#2563EB]"
                  />
                </label>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent overlayClassName="z-[130]" className="z-[130]">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete task?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete &ldquo;{task.title}&rdquo;. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-700"
              disabled={deleteMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                deleteMutation.mutate({ id: taskId });
              }}
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function EdgeTabButton({
  icon: Icon,
  label,
  onClick,
  active,
}: {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  label: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`h-10 w-11 -translate-x-full flex items-center justify-center rounded-l-2xl rounded-r-none text-white shadow-[0_2px_8px_rgba(37,99,235,0.35)] transition-colors ${
        active ? "bg-[#1D4ED8]" : "bg-[#2563EB] hover:bg-[#1D4ED8]"
      }`}
    >
      <Icon size={17} strokeWidth={2.25} />
    </button>
  );
}

function HeaderIconButton({
  icon: Icon,
  label,
  onClick,
  active,
  activeClassName = "text-[#2563EB] bg-blue-50",
}: {
  icon: React.ComponentType<{ size?: number }>;
  label: string;
  onClick: () => void;
  active?: boolean;
  activeClassName?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`w-9 h-9 flex items-center justify-center rounded-lg text-gray-500 transition-colors ${
        active ? activeClassName : "hover:bg-gray-100 hover:text-gray-800"
      }`}
    >
      <Icon size={18} />
    </button>
  );
}

function MenuQuickAction({
  icon: Icon,
  label,
  onClick,
}: {
  icon: React.ComponentType<{ size?: number }>;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center justify-center gap-2 py-3 px-1 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
    >
      <Icon size={18} className="text-gray-500" />
      <span className="text-[11px] font-medium leading-none text-center">{label}</span>
    </button>
  );
}

function MenuListItem({
  icon: Icon,
  label,
  onClick,
  disabled,
  active,
}: {
  icon: React.ComponentType<{ size?: number }>;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`w-full flex items-center gap-3 px-2 py-2.5 text-sm text-left rounded-lg transition-colors disabled:opacity-50 ${
        active ? "text-[#2563EB] bg-blue-50/60" : "text-gray-700 hover:bg-gray-50"
      }`}
    >
      <Icon size={16} className={active ? "text-[#2563EB]" : "text-gray-500"} />
      <span className="flex-1">{label}</span>
      <ChevronRight size={14} className="text-gray-400" />
    </button>
  );
}

function ActionMenuItem({
  icon: Icon,
  label,
  onClick,
  destructive,
}: {
  icon: React.ComponentType<{ size?: number }>;
  label: string;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 text-sm rounded-lg transition-colors ${
        destructive
          ? "text-[#E2352D] hover:bg-red-50"
          : "text-gray-800 hover:bg-gray-50"
      }`}
    >
      <span>{label}</span>
      <Icon size={16} className={destructive ? "text-[#E2352D]" : "text-gray-400"} />
    </button>
  );
}

function MetaRow({
  label,
  icon: Icon,
  children,
  align = "center",
}: {
  label: string;
  icon?: LucideIcon;
  children: React.ReactNode;
  align?: "center" | "start";
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-[16px_6.75rem_minmax(0,1fr)] gap-x-3 py-2.5 border-b border-gray-100 last:border-0",
        align === "center" ? "items-center" : "items-start",
      )}
    >
      {Icon ? (
        <Icon size={16} className="shrink-0 text-gray-400" />
      ) : (
        <span />
      )}
      <span className="text-sm text-gray-500 leading-none">{label}:</span>
      <div
        className={cn(
          "min-w-0",
          align === "center" ? "flex items-center" : "flex items-start pt-1.5",
        )}
      >
        {children}
      </div>
    </div>
  );
}

function UserChip({ name, avatar }: { name?: string | null; avatar?: string | null }) {
  if (!name) return <span className="text-gray-400">—</span>;
  return (
    <span className="inline-flex items-center gap-2 text-gray-800">
      <UserAvatar name={name} avatar={avatar} size={22} />
      {name}
    </span>
  );
}

function WorkflowStatusChip({ state }: { state: WorkflowState }) {
  const styles: Record<WorkflowState, { color: string; bg: string }> = {
    not_started: { color: "#6B7280", bg: "#F3F4F6" },
    in_progress: { color: "#2563EB", bg: "#DBEAFE" },
    paused: { color: "#D97706", bg: "#FEF3C7" },
    deferred: { color: "#7C3AED", bg: "#EDE9FE" },
    complete: { color: "#059669", bg: "#D1FAE5" },
  };
  const style = styles[state];
  return (
    <span
      className="inline-flex items-center rounded-full px-3 py-1 text-sm font-medium"
      style={{ backgroundColor: style.bg, color: style.color }}
    >
      {workflowLabel(state)}
    </span>
  );
}
