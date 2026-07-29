import { useEffect, useState } from "react";
import { Outlet } from "react-router";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { AppToaster } from "@/components/ui/app-toaster";
import { TaskNotificationToasts } from "@/components/notifications/TaskNotificationToasts";
import { SidebarWidthContext } from "@/hooks/useSidebarWidth";
import { getSidebarWidth, useLayoutMode } from "@/hooks/use-layout-mode";

export function AppLayout() {
  const layoutMode = useLayoutMode();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const sidebarWidth = getSidebarWidth(layoutMode, sidebarCollapsed);

  useEffect(() => {
    if (layoutMode !== "drawer") {
      setDrawerOpen(false);
    }
  }, [layoutMode]);

  return (
    <SidebarWidthContext.Provider value={sidebarWidth}>
      <div className="min-h-screen bg-[#F8F9FA] dark:bg-[#0b1220]">
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed((value) => !value)}
          drawerOpen={drawerOpen}
          onDrawerOpenChange={setDrawerOpen}
        />
        <div
          className="flex flex-col min-h-screen transition-[margin] duration-300"
          style={{ marginLeft: sidebarWidth }}
        >
          <Topbar
            sidebarWidth={sidebarWidth}
            showMenuButton={layoutMode === "drawer"}
            onMenuClick={() => setDrawerOpen(true)}
          />
          <main className="flex-1 p-4 pt-[4.5rem] sm:p-5 sm:pt-20 lg:p-6 lg:pt-20 min-w-0">
            <Outlet />
          </main>
        </div>
        <AppToaster />
        <TaskNotificationToasts />
      </div>
    </SidebarWidthContext.Provider>
  );
}
