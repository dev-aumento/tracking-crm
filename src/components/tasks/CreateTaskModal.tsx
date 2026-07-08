import { motion, AnimatePresence } from "framer-motion";
import { DetailedCreateTaskView } from "@/components/tasks/DetailedCreateTaskView";
import type { PendingTaskAttachment } from "@/components/tasks/TaskFilesSection";
import type { ProjectPipelineStageKey } from "@/lib/task-kanban";

export type CreateTaskFormData = {
  title: string;
  description: string;
  priority: "low" | "medium" | "high" | "urgent";
  assigneeId: number | undefined;
  ownerId: number | undefined;
  projectId: number | undefined;
  stage?: ProjectPipelineStageKey;
  dueDate: string;
  estimatedHours: string;
  tags: string;
  statusSummary: string;
  participantIds: number[];
  observerIds: number[];
  activeModules: string[];
  checklistItems: string[];
  pendingAttachments: PendingTaskAttachment[];
  subtaskTitles: string[];
  reminderDate: string;
  relatedTaskIds: number[];
  parentTaskId?: number;
  crmItem: string;
  customFields: { key: string; value: string }[];
  chatDrafts: { message: string; at: string }[];
};

export const EMPTY_CREATE_TASK_FORM: CreateTaskFormData = {
  title: "",
  description: "",
  priority: "medium",
  assigneeId: undefined,
  ownerId: undefined,
  projectId: undefined,
  stage: "new",
  dueDate: "",
  estimatedHours: "",
  tags: "",
  statusSummary: "",
  participantIds: [],
  observerIds: [],
  activeModules: ["status_summaries"],
  checklistItems: [""],
  pendingAttachments: [],
  subtaskTitles: [""],
  reminderDate: "",
  relatedTaskIds: [],
  parentTaskId: undefined,
  crmItem: "",
  customFields: [{ key: "", value: "" }],
  chatDrafts: [],
};

type UserOption = { id: number; name: string | null; avatar?: string | null };
type ProjectOption = { id: number; name: string };
type TaskLinkOption = { id: number; title: string };

interface CreateTaskModalProps {
  open: boolean;
  onClose: () => void;
  formData: CreateTaskFormData;
  onFormDataChange: (data: CreateTaskFormData) => void;
  onSubmit: () => void;
  isSubmitting?: boolean;
  users: UserOption[];
  projects: ProjectOption[];
  tasks?: TaskLinkOption[];
  currentUser?: UserOption | null;
}

export function CreateTaskModal({
  open,
  onClose,
  formData,
  onFormDataChange,
  onSubmit,
  isSubmitting,
  users,
  projects,
  tasks = [],
  currentUser,
}: CreateTaskModalProps) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-3 sm:p-6"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-white shadow-2xl w-full max-w-6xl h-[min(720px,92vh)] rounded-2xl overflow-hidden flex flex-col"
          >
            <DetailedCreateTaskView
              formData={formData}
              onFormDataChange={onFormDataChange}
              users={users}
              projects={projects}
              tasks={tasks}
              currentUser={currentUser}
              isSubmitting={isSubmitting}
              onSubmit={onSubmit}
              onCancel={onClose}
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
