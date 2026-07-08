import { useState } from "react";
import { Outlet } from "react-router";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { AppToaster } from "@/components/ui/app-toaster";
import { TaskNotificationToasts } from "@/components/notifications/TaskNotificationToasts";
import { SidebarWidthContext } from "@/hooks/useSidebarWidth";

export function AppLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const sidebarWidth = sidebarCollapsed ? 64 : 250;

  return (
    <SidebarWidthContext.Provider value={sidebarWidth}>
      <div className="min-h-screen bg-[#F8F9FA]">
        <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />
        <div
          className="flex flex-col min-h-screen transition-all duration-300"
          style={{ marginLeft: sidebarWidth }}
        >
          <Topbar sidebarCollapsed={sidebarCollapsed} />
          <main className="flex-1 p-6 pt-20">
            <Outlet />
          </main>
        </div>
        <AppToaster />
        <TaskNotificationToasts />
      </div>
    </SidebarWidthContext.Provider>
  );
}
