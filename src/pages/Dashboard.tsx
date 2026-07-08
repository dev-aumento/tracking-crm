import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { useLiveSessionTimers } from "@/hooks/useLiveSessionTimers";
import { formatElapsedHMS } from "@/lib/utils";
import {
  Clock, CheckCircle2, Timer, Users,
  Play, Square, Loader2,
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from "recharts";
import { motion } from "framer-motion";

export default function Dashboard() {
  const { user } = useAuth();

  const { data: stats } = trpc.dashboard.getStats.useQuery();
  const { data: weeklyActivity } = trpc.dashboard.getWeeklyActivity.useQuery();
  const { data: currentSession } = trpc.timeEntry.getCurrentSession.useQuery();
  const utils = trpc.useUtils();

  const clockInMutation = trpc.timeEntry.clockIn.useMutation({
    onSuccess: () => {
      utils.timeEntry.getCurrentSession.invalidate();
      utils.dashboard.getStats.invalidate();
    },
  });

  const clockOutMutation = trpc.timeEntry.clockOut.useMutation({
    onSuccess: () => {
      utils.timeEntry.getCurrentSession.invalidate();
      utils.dashboard.getStats.invalidate();
    },
  });

  const isClockedIn = !!currentSession?.active;
  const isPaused = !!currentSession?.paused;
  const { workSeconds } = useLiveSessionTimers(isClockedIn ? currentSession : null);

  const kpiCards = [
    {
      title: "Ongoing Tasks",
      value: stats?.ongoingTasks ?? 0,
      icon: Clock,
      iconColor: "#F59E0B",
      badge: { text: "In Progress", bg: "#FEF3C7", color: "#D97706" },
      subtext: "Currently assigned",
    },
    {
      title: "Completed Tasks",
      value: stats?.completedTasks ?? 0,
      icon: CheckCircle2,
      iconColor: "#10B981",
      badge: { text: "This Week", bg: "#D1FAE5", color: "#059669" },
      subtext: "Tasks finished",
    },
    {
      title: "Hours Tracked",
      value: `${stats?.hoursTracked ?? 0}h`,
      icon: Timer,
      iconColor: "#3B82F6",
      badge: { text: "Weekly", bg: "#DBEAFE", color: "#2563EB" },
      subtext: "Total time logged",
    },
    {
      title: "Performance",
      value: `${stats?.teamPerformance ?? 0}%`,
      icon: Users,
      iconColor: "#8B5CF6",
      badge: { text: "Completion Rate", bg: "#EDE9FE", color: "#7C3AED" },
      subtext: "Task completion",
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
      <motion.div variants={itemVariants} className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1F2937]">
            Welcome back, {user?.name?.split(" ")[0] || "there"}!
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
          </p>
        </div>

        {/* Clock In/Out Card */}
        <div className="bg-white border border-gray-200 rounded-xl px-5 py-3 flex items-center gap-4 shadow-sm">
          <div className="text-right">
            <div className="text-xs text-gray-500">
              {isClockedIn ? (isPaused ? "On break (work paused)" : "Session Time") : "Ready to work?"}
            </div>
            {isClockedIn && (
              <div className="text-xl font-bold text-[#1F2937] font-mono">{formatElapsedHMS(workSeconds)}</div>
            )}
          </div>
          <button
            onClick={() => isClockedIn ? clockOutMutation.mutate() : clockInMutation.mutate()}
            disabled={clockInMutation.isPending || clockOutMutation.isPending}
            className={`h-10 px-5 rounded-lg font-semibold text-sm flex items-center gap-2 transition-all ${
              isClockedIn
                ? "bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200"
                : "bg-gradient-to-r from-[#2563EB] to-[#3B82F6] text-white hover:shadow-lg hover:shadow-blue-200"
            }`}
          >
            {clockInMutation.isPending || clockOutMutation.isPending ? (
              <Loader2 size={16} className="animate-spin" />
            ) : isClockedIn ? (
              <><Square size={16} /> Clock Out</>
            ) : (
              <><Play size={16} /> Clock In</>
            )}
          </button>
        </div>
      </motion.div>

      {/* KPI Cards */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
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
            <div className="text-3xl font-bold text-[#1F2937] mb-1">{card.value}</div>
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
                stroke="#DC2626"
                strokeWidth={2}
                dot={{ fill: "#fff", stroke: "#DC2626", r: 4 }}
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
            <span className="w-2.5 h-2.5 rounded-full bg-[#DC2626]" />
            <span className="text-xs text-gray-500">Completed</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#2563EB]" />
            <span className="text-xs text-gray-500">Created</span>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
