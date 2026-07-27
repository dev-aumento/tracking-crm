import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { useLiveSessionTimers } from "@/hooks/useLiveSessionTimers";
import { formatElapsedHMS } from "@/lib/utils";
import {
  formatPreciseWorkedClock,
  localDateKey,
  workedSecondsFromStats,
} from "@/lib/work-hours-policy";
import { formatWorkZoneDate } from "@/lib/timezone";
import {
  Clock, CheckCircle2, Timer,
  Play, Square, Loader2,
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from "recharts";
import { motion } from "framer-motion";
import { useEffect, useMemo } from "react";
import { CrossDayClockOutDialog } from "@/components/time-tracking/CrossDayClockOutDialog";
import { useClockOutAction } from "@/hooks/useClockOutAction";
import {
  dashboardQueryOptions,
  DASHBOARD_REFRESH_EVENT,
  refreshDashboardPage,
} from "@/lib/dashboard-refresh";
import { isHrRoleOnly } from "@/lib/leave-policy";
import { HrDashboard } from "@/components/dashboard/HrDashboard";
import { WorkforceOverviewPanels } from "@/components/dashboard/WorkforceOverviewPanels";
import { WorkforceKpiCards } from "@/components/dashboard/WorkforceKpiCards";
import { LeaveSummaryPanel } from "@/components/dashboard/LeaveSummaryPanel";

export default function Dashboard() {
  const { user } = useAuth();

  if (isHrRoleOnly(user)) {
    return <HrDashboard />;
  }

  return <EmployeeDashboard />;
}

function EmployeeDashboard() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const { data: stats } = trpc.dashboard.getStats.useQuery(undefined, dashboardQueryOptions);
  const { data: todayStats } = trpc.timeEntry.getStats.useQuery(
    { period: "today" },
    dashboardQueryOptions,
  );
  const { data: weeklyActivity } = trpc.dashboard.getWeeklyActivity.useQuery(
    undefined,
    dashboardQueryOptions,
  );
  const { data: workforceOverview } = trpc.dashboard.getHrDashboard.useQuery(undefined, {
    ...dashboardQueryOptions,
    enabled: isAdmin,
  });
  const { data: leaveSummary } = trpc.dashboard.getLeaveSummary.useQuery(undefined, {
    ...dashboardQueryOptions,
    enabled: !isAdmin,
  });
  const { data: currentSession } = trpc.timeEntry.getCurrentSession.useQuery(
    undefined,
    dashboardQueryOptions,
  );
  const utils = trpc.useUtils();

  useEffect(() => {
    const onRefresh = () => {
      void refreshDashboardPage(utils);
    };
    window.addEventListener(DASHBOARD_REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(DASHBOARD_REFRESH_EVENT, onRefresh);
  }, [utils]);

  const invalidateTimeStats = () => {
    void refreshDashboardPage(utils);
  };

  const clockOutAction = useClockOutAction(invalidateTimeStats);

  const clockInMutation = trpc.timeEntry.clockIn.useMutation({
    onSuccess: invalidateTimeStats,
  });

  const isClockedIn = !!currentSession?.active;
  const isPaused = !!currentSession?.paused;
  const { workSeconds } = useLiveSessionTimers(isClockedIn ? currentSession : null);
  const priorWorkSeconds = currentSession?.priorDayWorkSeconds ?? 0;
  const cumulativeWorkSeconds = priorWorkSeconds + workSeconds;
  const hasWorkedToday = (todayStats?.totalSeconds ?? 0) > 0;

  const todayKey = localDateKey(new Date());
  const todayIncludeLive =
    !!todayStats?.activeSession && todayStats.activeSession.date === todayKey;

  const todayTrackedSeconds = useMemo(
    () => workedSecondsFromStats(todayStats, workSeconds, todayIncludeLive),
    [todayStats, workSeconds, todayIncludeLive],
  );

  const kpiCards = [
    {
      title: "Ongoing Tasks",
      value: stats?.ongoingTasks ?? 0,
      icon: Clock,
      iconColor: "#F59E0B",
      badge: { text: "To Do", bg: "#FEF3C7", color: "#D97706" },
      subtext: "Tasks awaiting action",
      mono: false,
    },
    {
      title: "Completed Tasks",
      value: stats?.completedTasks ?? 0,
      icon: CheckCircle2,
      iconColor: "#10B981",
      badge: { text: "Completed", bg: "#D1FAE5", color: "#059669" },
      subtext: "Tasks finished",
      mono: false,
    },
    {
      title: "Hours Tracked",
      value: formatPreciseWorkedClock(todayTrackedSeconds),
      icon: Timer,
      iconColor: "#3B82F6",
      badge: { text: "Today", bg: "#DBEAFE", color: "#2563EB" },
      subtext: "Time logged today",
      mono: true,
    },
  ];

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.08 },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 12 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: "easeOut" as const } },
  };

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      {/* Welcome + Clock In/Out */}
      <motion.div
        variants={itemVariants}
        className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
      >
        <div className="min-w-0">
          <h1 className="text-lg sm:text-2xl font-bold text-[#1F2937] whitespace-nowrap overflow-hidden text-ellipsis">
            Welcome back, {user?.name?.split(" ")[0] || "there"}!
          </h1>
          <p className="text-sm text-gray-500 mt-1 w-full">
            {formatWorkZoneDate(new Date(), {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </p>
        </div>

        {/* Clock In/Out Card — same resume logic as Time Tracking */}
        <div className="bg-white border border-gray-200 rounded-xl px-5 py-3 flex flex-col sm:flex-row items-start sm:items-center gap-3 shadow-sm w-full sm:w-auto">
          <div className="text-left sm:text-right w-full sm:w-auto">
            <div className="text-xs text-gray-500">
              {isClockedIn
                ? isPaused
                  ? "On break (work paused)"
                  : "Today's total"
                : hasWorkedToday
                  ? "Welcome back"
                  : "Ready to work?"}
            </div>
            {isClockedIn ? (
              <div className="text-xl font-bold text-[#1F2937] font-mono">
                {formatElapsedHMS(cumulativeWorkSeconds)}
              </div>
            ) : hasWorkedToday ? (
              <div className="text-sm font-semibold text-gray-600 font-mono">
                {formatPreciseWorkedClock(todayStats?.totalSeconds ?? 0)} logged today
              </div>
            ) : null}
          </div>
          <button
            onClick={() =>
              isClockedIn
                ? clockOutAction.requestClockOut(currentSession!.startTime)
                : clockInMutation.mutate()
            }
            disabled={clockInMutation.isPending || clockOutAction.isPending}
            className={`h-10 px-5 rounded-lg font-semibold text-sm flex items-center gap-2 transition-all ${
              isClockedIn
                ? "bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200"
                : "bg-gradient-to-r from-[#2563EB] to-[#3B82F6] text-white hover:shadow-lg hover:shadow-blue-200"
            }`}
          >
            {clockInMutation.isPending || clockOutAction.isPending ? (
              <Loader2 size={16} className="animate-spin" />
            ) : isClockedIn ? (
              <>
                <Square size={16} /> Clock Out
              </>
            ) : (
              <>
                <Play size={16} /> {hasWorkedToday ? "Clock In Again" : "Clock In"}
              </>
            )}
          </button>
        </div>
      </motion.div>

      {/* KPI Cards */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
        {kpiCards.map((card) => (
          <div
            key={card.title}
            className="bg-white border border-gray-200 rounded-xl p-5 hover:shadow-md transition-shadow"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <card.icon size={22} style={{ color: card.iconColor }} />
                <span className="text-xs font-medium text-gray-500">{card.title}</span>
              </div>
              <span
                className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                style={{ backgroundColor: card.badge.bg, color: card.badge.color }}
              >
                {card.badge.text}
              </span>
            </div>
            <div
              className={`text-3xl font-bold text-[#1F2937] mb-1 ${
                card.mono ? "font-mono tracking-tight" : ""
              }`}
            >
              {card.value}
            </div>
            <div className="text-xs text-gray-500">{card.subtext}</div>
          </div>
        ))}
      </motion.div>

      {/* Weekly Activity Chart */}
      <motion.div variants={itemVariants} className="bg-white border border-gray-200 rounded-xl p-5">
        <h2 className="font-semibold text-[#1F2937] mb-4">Weekly Activity</h2>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={weeklyActivity || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
              <XAxis dataKey="day" tick={{ fontSize: 12, fill: "#9CA3AF" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 12, fill: "#9CA3AF" }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ borderRadius: 8, border: "1px solid #E5E7EB", fontSize: 12 }}
              />
              <Line
                type="monotone"
                dataKey="completed"
                stroke="#0EA5E9"
                strokeWidth={2}
                dot={{ fill: "#fff", stroke: "#0EA5E9", r: 4 }}
                activeDot={{ r: 6 }}
                name="Completed"
              />
              <Line
                type="monotone"
                dataKey="created"
                stroke="#2563EB"
                strokeWidth={2}
                dot={{ fill: "#fff", stroke: "#2563EB", r: 4 }}
                activeDot={{ r: 6 }}
                name="Created"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="flex items-center justify-center gap-6 mt-3">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#0EA5E9]" />
            <span className="text-xs text-gray-500">Completed</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#2563EB]" />
            <span className="text-xs text-gray-500">Created</span>
          </div>
        </div>
      </motion.div>

      {/* Same Leave Summary as HR/Admin — for employees only (admin gets it in workforce panels) */}
      {!isAdmin ? (
        <motion.div variants={itemVariants}>
          <LeaveSummaryPanel
            leaveMonthLabel={leaveSummary?.leaveMonthLabel}
            upcomingLeaves={leaveSummary?.upcomingLeaves ?? []}
            upcomingWfh={leaveSummary?.upcomingWfh ?? []}
            employeeView
          />
        </motion.div>
      ) : null}

      {isAdmin ? (
        <>
          <motion.div variants={itemVariants}>
            <WorkforceKpiCards data={workforceOverview} />
          </motion.div>
          <motion.div variants={itemVariants}>
            <WorkforceOverviewPanels data={workforceOverview} />
          </motion.div>
        </>
      ) : null}

      {currentSession?.active ? (
        <CrossDayClockOutDialog
          open={clockOutAction.dialogOpen}
          onOpenChange={clockOutAction.setDialogOpen}
          sessionStartTime={currentSession.startTime}
          isPending={clockOutAction.isPending}
          onConfirmNow={clockOutAction.confirmClockOutNow}
          onUpdateTime={clockOutAction.updateClockOutTime}
        />
      ) : null}
    </motion.div>
  );
}
