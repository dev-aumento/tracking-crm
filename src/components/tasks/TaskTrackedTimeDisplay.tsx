import { Clock } from "lucide-react";
import { formatElapsedHMS, cn } from "@/lib/utils";

type TaskTrackedTimeDisplayProps = {
  /** Seconds shown on the clock (current session while live, otherwise total logged). */
  trackedSeconds: number;
  isTimerRunning?: boolean;
  isTimerPaused?: boolean;
  hasActiveSession?: boolean;
  className?: string;
};

export function TaskTrackedTimeDisplay({
  trackedSeconds,
  isTimerRunning = false,
  isTimerPaused = false,
  hasActiveSession = false,
  className,
}: TaskTrackedTimeDisplayProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 font-mono font-semibold tabular-nums",
        isTimerRunning ? "text-[#2563EB]" : "text-[#1F2937]",
        className,
      )}
    >
      <Clock
        size={14}
        className={isTimerRunning ? "text-[#2563EB] animate-pulse" : "text-gray-400"}
      />
      {formatElapsedHMS(trackedSeconds)}
      {isTimerRunning && (
        <span className="text-[10px] font-semibold uppercase tracking-wide text-[#2563EB] bg-blue-50 px-1.5 py-0.5 rounded font-sans">
          Live
        </span>
      )}
      {isTimerPaused && hasActiveSession && (
        <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded font-sans">
          Paused
        </span>
      )}
    </span>
  );
}
