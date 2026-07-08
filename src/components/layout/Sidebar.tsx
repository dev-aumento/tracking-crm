import { useLocation, useNavigate } from "react-router";
import { useAuth } from "@/hooks/useAuth";
import { useTaskChats } from "@/hooks/useTaskChats";
import { canAccessRoute } from "@/lib/permissions";
import {
  LayoutDashboard, ClipboardList, BarChart3, Settings,
  Users, Shield, ChevronLeft, ChevronRight,
  LogOut, FolderKanban, MessageSquare, Clock,
} from "lucide-react";

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

type NavItem = {
  path: string;
  icon: React.ElementType;
  label: string;
  badge?: number;
};

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { taskChatsCount } = useTaskChats();

  const mainNav: NavItem[] = [
    { path: "/", icon: LayoutDashboard, label: "Dashboard" },
    { path: "/tasks", icon: ClipboardList, label: "My Tasks" },
    { path: "/projects", icon: FolderKanban, label: "Projects" },
    { path: "/time-tracking", icon: Clock, label: "Time Tracking" },
  ];

  const insightsNav: NavItem[] = [
    { path: "/analytics", icon: BarChart3, label: "Analytics" },
  ];

  const adminNav: NavItem[] = [
    { path: "/admin/employees", icon: Users, label: "Employees" },
    { path: "/admin/tasks", icon: ClipboardList, label: "All Tasks" },
    { path: "/admin/permissions", icon: Shield, label: "Permissions" },
  ];

  const taskChatsNav: NavItem = {
    path: "/task-chats",
    icon: MessageSquare,
    label: "Task chats",
    badge: taskChatsCount > 0 ? taskChatsCount : undefined,
  };

  const filterNav = (items: NavItem[]) =>
    items.filter((item) => canAccessRoute(user, item.path));

  const visibleMain = filterNav(mainNav);
  const visibleInsights = filterNav(insightsNav);
  const visibleAdmin = filterNav(adminNav);
  const showTaskChats = canAccessRoute(user, taskChatsNav.path);

  const isActive = (path: string) => {
    if (path === "/") return location.pathname === "/";
    return location.pathname.startsWith(path);
  };

  const renderNavItem = (item: NavItem) => (
    <button
      key={item.path}
      onClick={() => navigate(item.path)}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 group relative ${
        isActive(item.path)
          ? "bg-white/10 text-white border-l-[3px] border-[#E2352D]"
          : "text-gray-400 hover:bg-white/5 hover:text-white border-l-[3px] border-transparent"
      }`}
    >
      <item.icon size={20} className={isActive(item.path) ? "text-[#E2352D]" : ""} />
      {!collapsed && (
        <>
          <span className="flex-1 text-left">{item.label}</span>
          {item.badge ? (
            <span className="bg-[#E2352D] text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
              {item.badge}
            </span>
          ) : null}
        </>
      )}
      {collapsed && item.badge ? (
        <span className="absolute -top-1 -right-1 bg-[#E2352D] text-white text-[8px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
          {item.badge}
        </span>
      ) : null}
    </button>
  );

  return (
    <aside
      className="fixed left-0 top-0 h-screen bg-[#1F2937] flex flex-col z-[120] transition-all duration-300"
      style={{ width: collapsed ? 64 : 250 }}
    >
      <div className="h-16 flex items-center gap-3 px-4 border-b border-white/10">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-r from-[#E2352D] to-[#F25C54] flex items-center justify-center flex-shrink-0">
          <span className="text-white font-bold text-sm">AT</span>
        </div>
        {!collapsed && (
          <span className="text-white font-bold text-lg tracking-tight">Aumento Track</span>
        )}
        <button
          onClick={onToggle}
          className="ml-auto text-gray-500 hover:text-white transition-colors"
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto scrollbar-thin py-4 px-2 space-y-1">
        {visibleMain.length > 0 && (
          <>
            {!collapsed && (
              <div className="px-3 mb-2 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                Main
              </div>
            )}
            {collapsed && <div className="h-4" />}
            {visibleMain.map(renderNavItem)}
          </>
        )}

        {visibleInsights.length > 0 && (
          <>
            {!collapsed && (
              <div className="px-3 mt-6 mb-2 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                Insights
              </div>
            )}
            {collapsed && <div className="h-4" />}
            {visibleInsights.map(renderNavItem)}
          </>
        )}

        {visibleAdmin.length > 0 && (
          <>
            {!collapsed && (
              <div className="px-3 mt-6 mb-2 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                Administration
              </div>
            )}
            {collapsed && <div className="h-4" />}
            {visibleAdmin.map(renderNavItem)}
          </>
        )}

        {showTaskChats && renderNavItem(taskChatsNav)}
      </nav>

      <div className="border-t border-white/10 p-2 space-y-1">
        <button
          onClick={() => navigate("/settings")}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
            isActive("/settings")
              ? "bg-white/10 text-white border-l-[3px] border-[#E2352D]"
              : "text-gray-400 hover:bg-white/5 hover:text-white border-l-[3px] border-transparent"
          }`}
        >
          <Settings size={20} />
          {!collapsed && <span>Settings</span>}
        </button>

        <button
          onClick={logout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-400 hover:bg-white/5 hover:text-white transition-all duration-150"
        >
          <LogOut size={20} />
          {!collapsed && <span>Logout</span>}
        </button>
      </div>
    </aside>
  );
}
