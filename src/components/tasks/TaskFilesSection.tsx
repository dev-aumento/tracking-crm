import { useRef, useState } from "react";
import { FileText, Image as ImageIcon, Loader2, Paperclip, Plus, Trash2 } from "lucide-react";
import { trpc } from "@/providers/trpc";
import {
  canPreviewInBrowser,
  downloadFileFromBase64,
  formatFileSize,
  getTaskFileBadge,
  openFileFromBase64,
  readFileAsBase64,
  truncateFileName,
  type TaskFileBadge,
} from "@/lib/task-files";
import { cn } from "@/lib/utils";

export type TaskAttachmentMeta = {
  id: number;
  fileName: string;
  mimeType: string;
  fileSize: number;
};

export type PendingTaskAttachment = {
  clientId: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  dataBase64: string;
};

type TaskFilesSectionProps = {
  taskId?: number;
  pendingFiles?: PendingTaskAttachment[];
  onPendingFilesChange?: (files: PendingTaskAttachment[]) => void;
  canManage?: boolean;
  className?: string;
};

export function TaskFilesSection({
  taskId,
  pendingFiles = [],
  onPendingFilesChange,
  canManage = true,
  className,
}: TaskFilesSectionProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const utils = trpc.useUtils();
  const [loadingId, setLoadingId] = useState<number | null>(null);

  const { data: savedFiles = [], isLoading } = trpc.task.listAttachments.useQuery(
    { taskId: taskId! },
    { enabled: Boolean(taskId) },
  );

  const addMutation = trpc.task.addAttachment.useMutation({
    onSuccess: () => {
      if (taskId) utils.task.listAttachments.invalidate({ taskId });
      if (taskId) utils.task.getById.invalidate({ id: taskId });
    },
  });

  const deleteMutation = trpc.task.deleteAttachment.useMutation({
    onSuccess: () => {
      if (taskId) utils.task.listAttachments.invalidate({ taskId });
      if (taskId) utils.task.getById.invalidate({ id: taskId });
    },
  });

  const files = taskId ? savedFiles : pendingFiles.map((file) => ({
    id: file.clientId,
    fileName: file.fileName,
    mimeType: file.mimeType,
    fileSize: file.fileSize,
    pending: true as const,
    dataBase64: file.dataBase64,
  }));

  const handlePickFiles = async (fileList: FileList | null) => {
    if (!fileList?.length || !canManage) return;

    const picked = await Promise.all(
      Array.from(fileList).map(async (file) => ({
        clientId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        fileSize: file.size,
        dataBase64: await readFileAsBase64(file),
      })),
    );

    if (taskId) {
      for (const file of picked) {
        await addMutation.mutateAsync({
          taskId,
          fileName: file.fileName,
          mimeType: file.mimeType,
          fileSize: file.fileSize,
          dataBase64: file.dataBase64,
        });
      }
      return;
    }

    onPendingFilesChange?.([...pendingFiles, ...picked]);
  };

  const handleOpen = async (file: {
    id: number | string;
    fileName: string;
    mimeType: string;
    pending?: boolean;
    dataBase64?: string;
  }) => {
    if (file.pending && file.dataBase64) {
      if (canPreviewInBrowser(file.mimeType, file.fileName)) {
        openFileFromBase64(file.fileName, file.mimeType, file.dataBase64);
      } else {
        downloadFileFromBase64(file.fileName, file.mimeType, file.dataBase64);
      }
      return;
    }

    if (typeof file.id !== "number") return;
    setLoadingId(file.id);
    try {
      const full = await utils.task.getAttachment.fetch({ id: file.id });
      if (!full?.dataBase64) return;
      if (canPreviewInBrowser(full.mimeType, full.fileName)) {
        openFileFromBase64(full.fileName, full.mimeType, full.dataBase64);
      } else {
        downloadFileFromBase64(full.fileName, full.mimeType, full.dataBase64);
      }
    } finally {
      setLoadingId(null);
    }
  };

  const handleDownload = async (file: {
    id: number | string;
    fileName: string;
    mimeType: string;
    pending?: boolean;
    dataBase64?: string;
  }) => {
    if (file.pending && file.dataBase64) {
      downloadFileFromBase64(file.fileName, file.mimeType, file.dataBase64);
      return;
    }

    if (typeof file.id !== "number") return;
    setLoadingId(file.id);
    try {
      const full = await utils.task.getAttachment.fetch({ id: file.id });
      if (!full?.dataBase64) return;
      downloadFileFromBase64(full.fileName, full.mimeType, full.dataBase64);
    } finally {
      setLoadingId(null);
    }
  };

  const handleRemove = async (file: {
    id: number | string;
    pending?: boolean;
  }) => {
    if (file.pending) {
      onPendingFilesChange?.(
        pendingFiles.filter((item) => item.clientId !== file.id),
      );
      return;
    }

    if (typeof file.id !== "number") return;
    await deleteMutation.mutateAsync({ id: file.id });
  };

  if (!canManage && files.length === 0) return null;

  return (
    <section className={cn("rounded-xl border border-gray-200 bg-white overflow-hidden", className)}>
      <div className="px-4 py-3 flex items-center justify-between border-b border-gray-100">
        <div className="flex items-center gap-2 text-sm font-semibold text-[#2563EB]">
          <Paperclip size={16} />
          <span>Files: {files.length}</span>
        </div>
        {canManage && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="sr-only"
              onChange={(e) => {
                void handlePickFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={addMutation.isPending}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors disabled:opacity-50"
              aria-label="Add files"
            >
              {addMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Plus size={18} />}
            </button>
          </>
        )}
      </div>

      <div className="p-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-8 text-gray-400">
            <Loader2 size={20} className="animate-spin" />
          </div>
        ) : files.length === 0 ? (
          <p className="text-sm text-gray-400 py-2">No files attached yet.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {files.map((file) => (
              <TaskFileCard
                key={file.id}
                fileName={file.fileName}
                mimeType={file.mimeType}
                fileSize={file.fileSize}
                dataBase64={"dataBase64" in file ? file.dataBase64 : undefined}
                isLoading={loadingId === file.id}
                canManage={canManage}
                onOpen={() => void handleOpen(file)}
                onDownload={() => void handleDownload(file)}
                onRemove={() => void handleRemove(file)}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function TaskFileCard({
  fileName,
  mimeType,
  fileSize,
  dataBase64,
  isLoading,
  canManage,
  onOpen,
  onDownload,
  onRemove,
}: {
  fileName: string;
  mimeType: string;
  fileSize: number;
  dataBase64?: string;
  isLoading?: boolean;
  canManage?: boolean;
  onOpen: () => void;
  onDownload: () => void;
  onRemove: () => void;
}) {
  const badge = getTaskFileBadge(fileName, mimeType);
  const isImage = badge.kind === "image" && dataBase64;

  return (
    <div className="group relative rounded-xl border border-gray-200 bg-gray-50/60 p-3 hover:border-[#2563EB]/30 hover:bg-white transition-colors">
      <button
        type="button"
        onClick={onOpen}
        disabled={isLoading}
        className="w-full text-left disabled:opacity-60"
        title={`Open ${fileName}`}
      >
        <div className="relative mx-auto mb-2 flex h-20 w-full items-center justify-center rounded-lg border border-gray-200 bg-white overflow-hidden">
          {isImage ? (
            <img
              src={`data:${mimeType};base64,${dataBase64}`}
              alt={fileName}
              className="h-full w-full object-cover"
            />
          ) : (
            <FileTypePreview badge={badge} />
          )}
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/70">
              <Loader2 size={18} className="animate-spin text-[#2563EB]" />
            </div>
          )}
        </div>
        <p className="text-xs text-gray-700 text-center leading-snug px-1">
          {truncateFileName(fileName)}
        </p>
        <p className="text-[10px] text-gray-400 text-center mt-0.5">{formatFileSize(fileSize)}</p>
      </button>

      <div className="mt-2 flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          type="button"
          onClick={onDownload}
          className="text-[11px] font-medium text-[#2563EB] hover:underline"
        >
          Download
        </button>
        {canManage && (
          <button
            type="button"
            onClick={onRemove}
            className="text-[11px] font-medium text-gray-400 hover:text-red-500 inline-flex items-center gap-1"
          >
            <Trash2 size={12} />
            Remove
          </button>
        )}
      </div>
    </div>
  );
}

function FileTypePreview({ badge }: { badge: TaskFileBadge }) {
  const Icon = badge.kind === "image" ? ImageIcon : FileText;
  return (
    <div className="relative flex items-center justify-center">
      <Icon size={34} className={badge.iconClass} strokeWidth={1.5} />
      <span
        className={cn(
          "absolute -bottom-1 -right-1 rounded px-1.5 py-0.5 text-[10px] font-bold leading-none",
          badge.badgeClass,
        )}
      >
        {badge.label}
      </span>
    </div>
  );
}
