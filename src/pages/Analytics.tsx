import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { UserAvatar } from "@/components/shared/UserAvatar";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell,
} from "recharts";
import { motion } from "framer-motion";
import { BarChart3, Users, Clock, CheckCircle2, Loader2 } from "lucide-react";

const COLORS = ["#DC2626", "#2563EB", "#10B981", "#F59E0B", "#8B5CF6", "#EC4899"];

export default function Analytics() {
  const [period, setPeriod] = useState<"week" | "month">("week");
  const { data: workload, isLoading: workloadLoading } = trpc.dashboard.getWorkload.useQuery();
  const { data: adminStats } = trpc.dashboard.getAdminStats.useQuery();

  const taskStatusData = [
    { name: "To Do", value: 4 },
    { name: "In Progress", value: 3 },
    { name: "Review", value: 2 },
    { name: "Done", value: 4 },
  ];

  const weeklyCompletion = [
    { day: "Mon", completed: 3, created: 5 },
    { day: "Tue", completed: 2, created: 3 },
    { day: "Wed", completed: 4, created: 2 },
    { day: "Thu", completed: 1, created: 4 },
    { day: "Fri", completed: 3, created: 3 },
    { day: "Sat", completed: 0, created: 0 },
    { day: "Sun", completed: 0, created: 0 },
  ];

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.08 } },
  };
  const itemVariants = {
    hidden: { opacity: 0, y: 12 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.35 } },
  };

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6">
      <motion.div variants={itemVariants}>
        <h1 className="text-2xl font-bold text-[#1F2937]">Analytics</h1>
        <p className="text-sm text-gray-500 mt-0.5">Team performance and workload insights</p>
      </motion.div>

      {/* Stats Row */}
      {adminStats && (
        <motion.div variants={itemVariants} className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          {[
            { label: "Employees", value: adminStats.totalEmployees, icon: Users },
            { label: "Active Projects", value: adminStats.activeProjects, icon: CheckCircle2 },
            { label: "Total Tasks", value: adminStats.totalTasks, icon: BarChart3 },
            { label: "Weekly Hours", value: `${adminStats.weeklyHours}h`, icon: Clock },
            { label: "Active Clock-Ins", value: adminStats.activeClockIns, icon: Clock },
          ].map((stat) => (
            <div key={stat.label} className="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-md transition-shadow">
              <div className="flex items-center gap-2 mb-2">
                <stat.icon size={16} className="text-[#2563EB]" />
                <span className="text-xs text-gray-500">{stat.label}</span>
              </div>
              <div className="text-xl font-bold text-[#1F2937]">{stat.value}</div>
            </div>
          ))}
        </motion.div>
      )}

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Workload Distribution */}
        <motion.div variants={itemVariants} className="bg-white border border-gray-200 rounded-xl p-5">
          <h2 className="font-semibold text-[#1F2937] mb-4">Team Workload</h2>
          {workloadLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={24} className="animate-spin text-gray-400" />
            </div>
          ) : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={workload || []} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                  <XAxis type="number" tick={{ fontSize: 11, fill: "#9CA3AF" }} axisLine={false} tickLine={false} />
                  <YAxis
                    dataKey="name"
                    type="category"
                    tick={{ fontSize: 11, fill: "#9CA3AF" }}
                    axisLine={false}
                    tickLine={false}
                    width={80}
                  />
                  <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #E5E7EB", fontSize: 12 }} />
                  <Bar dataKey="hoursLogged" fill="#2563EB" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </motion.div>

        {/* Task Status Distribution */}
        <motion.div variants={itemVariants} className="bg-white border border-gray-200 rounded-xl p-5">
          <h2 className="font-semibold text-[#1F2937] mb-4">Task Status</h2>
          <div className="h-56 flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={taskStatusData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={4}
                  dataKey="value"
                >
                  {taskStatusData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #E5E7EB", fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap justify-center gap-4 mt-2">
            {taskStatusData.map((entry, index) => (
              <div key={entry.name} className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[index] }} />
                <span className="text-xs text-gray-500">{entry.name} ({entry.value})</span>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Weekly Completion Trend */}
        <motion.div variants={itemVariants} className="bg-white border border-gray-200 rounded-xl p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-[#1F2937]">Task Completion Trend</h2>
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
              {(["week", "month"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${period === p ? "bg-white text-[#2563EB] shadow-sm" : "text-gray-500"}`}
                >
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={weeklyCompletion}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                <XAxis dataKey="day" tick={{ fontSize: 12, fill: "#9CA3AF" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: "#9CA3AF" }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #E5E7EB", fontSize: 12 }} />
                <Line type="monotone" dataKey="completed" stroke="#DC2626" strokeWidth={2} dot={{ r: 4 }} name="Completed" />
                <Line type="monotone" dataKey="created" stroke="#2563EB" strokeWidth={2} dot={{ r: 4 }} name="Created" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </motion.div>
      </div>

      {/* Team Workload Table */}
      {workload && workload.length > 0 && (
        <motion.div variants={itemVariants} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-[#1F2937]">Team Member Details</h2>
          </div>
          <div className="divide-y divide-gray-50">
            {workload.map((member) => (
              <div key={member.userId} className="flex items-center gap-4 px-5 py-3 hover:bg-gray-50 transition-colors">
                <UserAvatar name={member.name} avatar={member.avatar} size={36} />
                <div className="flex-1">
                  <div className="text-sm font-medium text-[#1F2937]">{member.name}</div>
                  <div className="text-xs text-gray-400 capitalize">{member.role}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold text-[#1F2937]">{member.hoursLogged}h</div>
                  <div className="text-xs text-gray-400">{member.taskCount} active tasks</div>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}
