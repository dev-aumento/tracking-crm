import type { Dispatch, SetStateAction } from "react";
import { motion } from "framer-motion";
import { X } from "lucide-react";
import { ModalBackdrop } from "@/components/shared/ModalBackdrop";
import { DetailedCreateTaskView } from "@/components/tasks/DetailedCreateTaskView";
import type { PendingTaskAttachment } from "@/components/tasks/TaskFilesSection";
import type { CommentMediaRef } from "@/lib/rich-comment";
import type { PipelineStageDef, ProjectPipelineStageKey } from "@/lib/task-kanban";
import { defaultTaskDeadlineIso } from "@/lib/task-deadline";

export type CreateTaskFormData = {
  title: string;
  description: string;
  descriptionHtml: string;
  descriptionMedia: CommentMediaRef[];
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
  descriptionHtml: "",
  descriptionMedia: [],
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
  activeModules: [],
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

/** Fresh create-task form with deadline defaulted to today at 7:00 PM IST. */
export function createEmptyTaskForm(
  overrides?: Partial<CreateTaskFormData>,
): CreateTaskFormData {
  return {
    ...EMPTY_CREATE_TASK_FORM,
    dueDate: defaultTaskDeadlineIso(),
    ...overrides,
  };
}

type UserOption = { id: number; name: string | null; avatar?: string | null };
type ProjectOption = { id: number; name: string };
type TaskLinkOption = { id: number; title: string };

interface CreateTaskModalProps {
  open: boolean;
  onClose: () => void;
  formData: CreateTaskFormData;
  onFormDataChange: Dispatch<SetStateAction<CreateTaskFormData>>;
  onSubmit: () => void;
  isSubmitting?: boolean;
  users: UserOption[];
  projects: ProjectOption[];
  tasks?: TaskLinkOption[];
  currentUser?: UserOption | null;
  pipelineStages?: PipelineStageDef[];
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
  pipelineStages,
}: CreateTaskModalProps) {
  return (
    <ModalBackdrop
      open={open}
      onClose={onClose}
      overlayClassName="p-3 sm:p-6"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        onClick={(e) => e.stopPropagation()}
        className="relative bg-white shadow-2xl w-full max-w-6xl h-[min(720px,92vh)] rounded-2xl overflow-visible flex flex-col"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-0 right-0 z-30 flex h-10 w-10 -translate-y-1/2 translate-x-1/2 items-center justify-center rounded-full bg-[#2563EB] text-white shadow-[0_2px_8px_rgba(37,99,235,0.35)] transition-colors hover:bg-[#1D4ED8]"
        >
          <X size={17} strokeWidth={2.25} />
        </button>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl">
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
            pipelineStages={pipelineStages}
          />
        </div>
      </motion.div>
    </ModalBackdrop>
  );
}
