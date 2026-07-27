import { Menu } from "lucide-react";
import { ProfileMenu } from "@/components/layout/ProfileMenu";
import { NotificationMenu } from "@/components/layout/NotificationMenu";

interface TopbarProps {
  sidebarWidth: number;
  showMenuButton?: boolean;
  onMenuClick?: () => void;
}

export function Topbar({ sidebarWidth, showMenuButton, onMenuClick }: TopbarProps) {
  return (
    <header
      className="fixed top-0 right-0 h-14 sm:h-16 bg-white border-b border-gray-200 z-30 flex items-center justify-between gap-3 px-4 sm:px-6 transition-[left] duration-300"
      style={{ left: sidebarWidth }}
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        {showMenuButton ? (
          <button
            type="button"
            onClick={onMenuClick}
            className="h-9 w-9 flex items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-[#2563EB] transition-colors shrink-0"
            aria-label="Open navigation menu"
          >
            <Menu size={20} />
          </button>
        ) : null}
      </div>

      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        <NotificationMenu />
        <ProfileMenu />
      </div>
    </header>
  );
}
