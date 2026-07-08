import { ProfileMenu } from "@/components/layout/ProfileMenu";
import { NotificationMenu } from "@/components/layout/NotificationMenu";

interface TopbarProps {
  sidebarCollapsed: boolean;
}

export function Topbar({ sidebarCollapsed }: TopbarProps) {
  return (
    <header
      className="fixed top-0 right-0 h-16 bg-white border-b border-gray-200 z-30 flex items-center justify-between px-6 transition-all duration-300"
      style={{ left: sidebarCollapsed ? 64 : 250 }}
    >
      <div className="flex-1" aria-hidden="true" />

      <div className="flex items-center gap-2 shrink-0">
        <NotificationMenu />
        <ProfileMenu />
      </div>
    </header>
  );
}
