import { useEffect, useRef, useState } from "react";
import { Camera, Upload, X, Loader2 } from "lucide-react";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { AVATAR_PRESETS, MAX_AVATAR_UPLOAD_BYTES } from "@/lib/avatar-options";
import { compressAvatarFile } from "@/lib/avatar-upload";

interface AvatarPickerModalProps {
  open: boolean;
  name?: string | null;
  currentAvatar?: string | null;
  onClose: () => void;
  onSelect: (avatarUrl: string) => void;
}

export function AvatarPickerModal({
  open,
  name,
  currentAvatar,
  onClose,
  onSelect,
}: AvatarPickerModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(currentAvatar ?? null);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (open) {
      setPreview(currentAvatar ?? null);
      setError(null);
    }
  }, [open, currentAvatar]);

  if (!open) return null;

  const handleFileChange = async (file: File | null) => {
    if (!file) return;
    setError(null);

    if (!file.type.startsWith("image/")) {
      setError("Please choose a JPG, PNG, or GIF image.");
      return;
    }

    if (file.size > MAX_AVATAR_UPLOAD_BYTES) {
      setError("Image must be 2MB or smaller.");
      return;
    }

    setProcessing(true);
    try {
      const dataUrl = await compressAvatarFile(file);
      setPreview(dataUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not process that image.");
    } finally {
      setProcessing(false);
    }
  };

  const handleApply = () => {
    if (!preview) {
      setError("Choose a preset or upload an image.");
      return;
    }
    onSelect(preview);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Close avatar picker"
        onClick={onClose}
      />
      <div className="relative w-full max-w-lg bg-white rounded-xl border border-gray-200 shadow-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-[#1F2937]">Change Avatar</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex items-center gap-4 mb-5">
          <UserAvatar name={name} avatar={preview ?? currentAvatar} size={72} />
          <div>
            <p className="text-sm text-gray-600">Pick a preset or upload your own image.</p>
            <p className="text-xs text-gray-400 mt-1">JPG, PNG or GIF. Max 2MB.</p>
          </div>
        </div>

        <div className="mb-4">
          <div className="text-xs font-medium text-gray-500 mb-2">Choose avatar</div>
          <div className="grid grid-cols-6 gap-2">
            {AVATAR_PRESETS.map((preset) => (
              <button
                key={preset.seed}
                type="button"
                onClick={() => {
                  setError(null);
                  setPreview(preset.url);
                }}
                className={`rounded-full p-0.5 border-2 transition-colors ${
                  preview === preset.url
                    ? "border-[#2563EB]"
                    : "border-transparent hover:border-gray-200"
                }`}
                aria-label={`Use ${preset.seed} avatar`}
              >
                <UserAvatar name={preset.seed} avatar={preset.url} size={40} />
              </button>
            ))}
          </div>
        </div>

        <div className="mb-4">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            className="hidden"
            onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={processing}
            className="h-9 px-4 border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 flex items-center gap-2 disabled:opacity-60"
          >
            {processing ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            {processing ? "Processing..." : "Upload image"}
          </button>
        </div>

        {error && <p className="text-sm text-red-500 mb-3">{error}</p>}

        <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
          <button
            type="button"
            onClick={onClose}
            className="h-9 px-4 text-sm text-gray-500 hover:text-gray-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            className="h-9 px-4 bg-[#2563EB] text-white rounded-lg text-sm font-semibold hover:bg-[#1D4ED8] flex items-center gap-2"
          >
            <Camera size={14} />
            Use avatar
          </button>
        </div>
      </div>
    </div>
  );
}
