import type { CreateTaskFormData } from "@/components/tasks/CreateTaskModal";
import { resolveCloneTitle } from "@/lib/task-create-prefill";
import type { PendingTaskAttachment } from "@/components/tasks/TaskFilesSection";
import type { ProjectPipelineStageKey } from "@/lib/task-kanban";

type CreateTaskInput = {
  title: string;
  description?: string;
  priority?: "low" | "medium" | "high" | "urgent";
  assigneeId?: number;
  projectId?: number | null;
  dueDate?: string;
  estimatedHours?: number;
  tags?: string[];
  stage?: ProjectPipelineStageKey;
};

type CreateTaskResult = { id: number };

type SubmitCreateTaskOptions = {
  formData: CreateTaskFormData;
  cloneSourceTitle?: string | null;
  createMutation: {
    mutateAsync: (input: CreateTaskInput) => Promise<CreateTaskResult>;
  };
  addParticipantMutation: {
    mutateAsync: (input: { taskId: number; userId: number }) => Promise<unknown>;
  };
  addObserverMutation: {
    mutateAsync: (input: { taskId: number; userId: number }) => Promise<unknown>;
  };
  updateMutation?: {
    mutateAsync: (input: { id: number; createdBy: number | null }) => Promise<unknown>;
  };
  createSubtaskMutation?: {
    mutateAsync: (input: { taskId: number; title: string }) => Promise<unknown>;
  };
  addCommentMutation?: {
    mutateAsync: (input: { taskId: number; message: string }) => Promise<unknown>;
  };
  addAttachmentMutation?: {
    mutateAsync: (input: {
      taskId: number;
      fileName: string;
      mimeType: string;
      fileSize: number;
      dataBase64: string;
    }) => Promise<unknown>;
  };
};

function buildTaskDescription(formData: CreateTaskFormData, tasksById: Map<number, string>) {
  const parentLabel = formData.parentTaskId
    ? tasksById.get(formData.parentTaskId)
    : undefined;

  const relatedLabels = formData.relatedTaskIds
    .map((id) => tasksById.get(id))
    .filter(Boolean);

  const customFieldLines = formData.customFields
    .filter((field) => field.key.trim() || field.value.trim())
    .map((field) => `${field.key.trim()}: ${field.value.trim()}`);

  return [
    formData.description.trim(),
    formData.statusSummary.trim()
      ? `Status summary: ${formData.statusSummary.trim()}`
      : "",
    formData.crmItem.trim() ? `CRM: ${formData.crmItem.trim()}` : "",
    parentLabel ? `Parent task: ${parentLabel}` : "",
    relatedLabels.length > 0 ? `Related tasks: ${relatedLabels.join(", ")}` : "",
    formData.reminderDate.trim()
      ? `Reminder: ${new Date(formData.reminderDate).toLocaleString()}`
      : "",
    ...formData.checklistItems
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => `☐ ${item}`),
    ...customFieldLines,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export async function submitCreateTask({
  formData,
  cloneSourceTitle,
  createMutation,
  addParticipantMutation,
  addObserverMutation,
  updateMutation,
  createSubtaskMutation,
  addCommentMutation,
  addAttachmentMutation,
  tasksById = new Map(),
}: SubmitCreateTaskOptions & { tasksById?: Map<number, string> }) {
  if (!formData.title.trim()) return null;

  const tags = formData.tags
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  const description = buildTaskDescription(formData, tasksById);

  const title = cloneSourceTitle
    ? resolveCloneTitle(formData.title, cloneSourceTitle)
    : formData.title.trim();

  const task = await createMutation.mutateAsync({
    title,
    description: description || undefined,
    priority: formData.priority,
    assigneeId: formData.assigneeId,
    projectId: formData.projectId ?? null,
    dueDate: formData.dueDate || undefined,
    estimatedHours: formData.estimatedHours ? Number(formData.estimatedHours) : undefined,
    tags: tags.length > 0 ? tags : undefined,
    stage: formData.stage as ProjectPipelineStageKey | undefined,
  });

  if (formData.ownerId && updateMutation) {
    await updateMutation.mutateAsync({ id: task.id, createdBy: formData.ownerId });
  }

  const sideEffects: Promise<unknown>[] = [
    ...formData.participantIds.map((participantId) =>
      addParticipantMutation.mutateAsync({ taskId: task.id, userId: participantId }),
    ),
    ...formData.observerIds.map((observerId) =>
      addObserverMutation.mutateAsync({ taskId: task.id, userId: observerId }),
    ),
  ];

  if (createSubtaskMutation) {
    for (const subtaskTitle of formData.subtaskTitles.map((t) => t.trim()).filter(Boolean)) {
      sideEffects.push(createSubtaskMutation.mutateAsync({ taskId: task.id, title: subtaskTitle }));
    }
  }

  if (addCommentMutation) {
    for (const message of formData.chatDrafts.map((d) => d.message.trim()).filter(Boolean)) {
      sideEffects.push(addCommentMutation.mutateAsync({ taskId: task.id, message }));
    }
  }

  if (addAttachmentMutation) {
    for (const file of formData.pendingAttachments) {
      sideEffects.push(
        addAttachmentMutation.mutateAsync({
          taskId: task.id,
          fileName: file.fileName,
          mimeType: file.mimeType,
          fileSize: file.fileSize,
          dataBase64: file.dataBase64,
        }),
      );
    }
  }

  if (sideEffects.length > 0) {
    await Promise.all(sideEffects);
  }

  return task;
}
