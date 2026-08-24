import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { useAuth } from "@/hooks/useAuth";
import { useTaskChatBadgeCount } from "@/hooks/useTaskChats";
import { canAccessRoute } from "@/lib/permissions";
import { canManageLeaves, isAdminOrManagement, isFinanceRoleOnly } from "@/lib/leave-policy";
import { isClientPortalUser } from "@/lib/client-portal";
import { ClientSidebarPanel } from "@/components/layout/ClientSidebar";
import { requestDashboardRefresh } from "@/lib/dashboard-refresh";
import {
  getSidebarWidth,
  useLayoutMode,
} from "@/hooks/use-layout-mode";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  LayoutDashboard,
  ClipboardList,
  Handshake,
  ListTodo,
  BarChart3,
  Settings,
  Users,
  Shield,
  ChevronLeft,
  ChevronRight,
  LogOut,
  FolderKanban,
  MessageSquare,
  Clock,
  CalendarDays,
  ClipboardCheck,
  UserMinus,
  FileText,
  Building2,
  CalendarCheck2,
  MapPin,
  QrCode,
  Banknote,
  Receipt,
  ScrollText,
  Wallet,
  HandCoins,
  Scale,
  TrendingUp,
  ArrowLeftRight,
  Landmark,
  BookOpen,
  Plug,
  ChevronDown,
  History,
  CreditCard,
} from "lucide-react";
import {
  SHOW_LOCATION_QR_MENU,
  isLocationQrMenuPath,
} from "@/lib/location-qr-menu";
import { BrandLogo } from "@/components/brand/BrandLogo";

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  drawerOpen: boolean;
  onDrawerOpenChange: (open: boolean) => void;
}

type NavItem = {
  path: string;
  icon: React.ElementType;
  label: string;
  badge?: number;
  /** Section label for grouped leadership sidebars (WORK / PEOPLE / …). */
  section?: string;
  id?: string;
  /** When false, the item still navigates but never shows as active. */
  matchActive?: boolean;
  expandable?: boolean;
};

const SECTION_ORDER = [
  "ACCOUNTS",
  "REPORTS",
  "SETTINGS",
  "OVERVIEW",
  "WORK",
  "PEOPLE",
  "BUSINESS",
  "FINANCE",
  "SYSTEM",
] as const;

function isLeadershipSidebarUser(
  user: { role?: string | null; department?: string | null } | null | undefined,
) {
  if (!user) return false;
  const role = String(user.role ?? "").toLowerCase();
  if (role === "admin" || role === "manager") return true;
  return isAdminOrManagement(user);
}

function SidebarPanel({
  collapsed,
  showCollapseToggle,
  onToggle,
  onNavigate,
}: {
  collapsed: boolean;
  showCollapseToggle: boolean;
  onToggle: () => void;
  onNavigate: (path: string) => void;
}) {
  const location = useLocation();
  const { user, logout } = useAuth();
  const taskChatsCount = useTaskChatBadgeCount();
  const leadershipNav = isLeadershipSidebarUser(user);
  const [timeHoursOpen, setTimeHoursOpen] = useState(true);

  const navItems: NavItem[] = useMemo(() => {
    const hidePersonalNav = isAdminOrManagement(user);
    const isAdmin = user?.role === "admin";

    if (isFinanceRoleOnly(user)) {
      return [
        { path: "/", icon: LayoutDashboard, label: "Dashboard", section: "ACCOUNTS" },
        { path: "/admin/invoices", icon: FileText, label: "Invoices", section: "ACCOUNTS" },
        { path: "/finance/payments", icon: Banknote, label: "Payments", section: "ACCOUNTS" },
        { path: "/finance/expenses", icon: Receipt, label: "Expenses", section: "ACCOUNTS" },
        { path: "/finance/estimates", icon: ClipboardList, label: "Estimates", section: "ACCOUNTS" },
        { path: "/finance/contracts", icon: ScrollText, label: "Contracts", section: "ACCOUNTS" },
        { path: "/finance/receivable", icon: Wallet, label: "Accounts Receivable", section: "ACCOUNTS" },
        { path: "/finance/payable", icon: HandCoins, label: "Accounts Payable", section: "ACCOUNTS" },
        { path: "/finance/tax", icon: Scale, label: "Tax & Compliance", section: "ACCOUNTS" },
        { path: "/finance/reports", icon: BarChart3, label: "Financial Reports", section: "REPORTS" },
        { path: "/finance/profit-loss", icon: TrendingUp, label: "Profit & Loss", section: "REPORTS" },
        { path: "/finance/cash-flow", icon: ArrowLeftRight, label: "Cash Flow", section: "REPORTS" },
        { path: "/finance/balance-sheet", icon: Landmark, label: "Balance Sheet", section: "REPORTS" },
        { path: "/finance/chart-of-accounts", icon: BookOpen, label: "Chart of Accounts", section: "SETTINGS" },
        { path: "/finance/banks", icon: Building2, label: "Bank Accounts", section: "SETTINGS" },
      ];
    }

    if (leadershipNav) {
      const items: NavItem[] = [
        { path: "/", icon: LayoutDashboard, label: "Dashboard" },
        { path: "/admin/tasks", icon: ClipboardList, label: "Tasks", section: "WORK" },
        { path: "/projects", icon: FolderKanban, label: "Projects", section: "WORK" },
        {
          path: "/admin/client-tasks",
          icon: Handshake,
          label: "Client's Tasks",
          section: "WORK",
        },
        {
          path: "/time-tracking",
          icon: Clock,
          label: "Time & Hours",
          section: "PEOPLE",
        },
        {
          path: "/admin/employees",
          icon: Users,
          label: "Employees",
          section: "PEOPLE",
        },
        {
          path: "/leave-management",
          icon: ClipboardCheck,
          label: "Leave",
          section: "PEOPLE",
        },
        {
          path: "/attendance-management",
          icon: CalendarCheck2,
          label: "Attendance",
          section: "PEOPLE",
        },
        {
          id: "departments",
          path: "/admin/departments",
          icon: Building2,
          label: "Departments",
          section: "PEOPLE",
        },
        {
          id: "activity-logs",
          path: "/recent-employees",
          icon: History,
          label: "Recent Employees",
          section: "PEOPLE",
        },
        {
          id: "people-reports",
          path: "/analytics",
          icon: BarChart3,
          label: "Reports & Analytics",
          section: "PEOPLE",
        },
        {
          path: "/admin/customers",
          icon: Building2,
          label: "Clients",
          section: "BUSINESS",
        },
        {
          path: "/admin/invoices",
          icon: FileText,
          label: "Invoices",
          section: "BUSINESS",
        },
        {
          id: "business-reports",
          path: "/admin/reports",
          icon: BarChart3,
          label: "Reports & Analytics ",
          section: "BUSINESS",
        },
        {
          path: "/admin/permissions",
          icon: Shield,
          label: "Permissions",
          section: "SYSTEM",
        },
        {
          path: "/settings",
          icon: Settings,
          label: "Settings",
          section: "SYSTEM",
        },
        {
          path: "/locations",
          icon: MapPin,
          label: "Location",
          section: "SYSTEM",
        },
        {
          path: "/qr-code",
          icon: QrCode,
          label: "QR Code",
          section: "SYSTEM",
        },
        ...(isAdmin
          ? [
              {
                path: "/admin/pricing",
                icon: CreditCard,
                label: "Pricing",
                section: "SYSTEM",
              },
            ]
          : []),
      ];
      return items;
    }

    // Employee / HR: flat list (existing behavior)
    const items: NavItem[] = [
      { path: "/", icon: LayoutDashboard, label: "Dashboard" },
      ...(hidePersonalNav
        ? []
        : [{ path: "/tasks", icon: ListTodo, label: "My Tasks" }]),
      { path: "/admin/tasks", icon: ClipboardList, label: "All Tasks" },
      { path: "/projects", icon: FolderKanban, label: "Projects" },
      {
        path: "/time-tracking",
        icon: Clock,
        label: hidePersonalNav ? "Employee Hours" : "Time Tracking",
      },
      { path: "/admin/employees", icon: Users, label: "Employees" },
      { path: "/admin/departments", icon: Building2, label: "Departments" },
      { path: "/admin/permissions", icon: Shield, label: "Permissions" },
      ...(isAdmin
        ? [
            { path: "/admin/invoices", icon: FileText, label: "Invoice" },
            { path: "/admin/customers", icon: Building2, label: "Customers" },
          ]
        : []),
      { path: "/analytics", icon: BarChart3, label: "Analytics" },
      ...(hidePersonalNav
        ? []
        : [
            {
              path: "/task-chats",
              icon: MessageSquare,
              label: "Task Chats",
              badge: taskChatsCount > 0 ? taskChatsCount : undefined,
            },
            { path: "/leaves", icon: CalendarDays, label: "Leaves" },
          ]),
    ];
    if (canManageLeaves(user)) {
      items.push(
        {
          path: "/leave-management",
          icon: ClipboardCheck,
          label: "Leave Management",
        },
        {
          path: "/attendance-management",
          icon: CalendarCheck2,
          label: "Attendance",
        },
        {
          path: "/recent-employees",
          icon: UserMinus,
          label: "Recent employees",
        },
        { path: "/locations", icon: MapPin, label: "Location" },
        { path: "/qr-code", icon: QrCode, label: "QR Code" },
      );
    }
    if (isAdmin) {
      items.push({ path: "/admin/pricing", icon: CreditCard, label: "Pricing" });
    }
    return items;
  }, [taskChatsCount, user, leadershipNav]);

  const visibleNav = navItems.filter((item) => {
    if (!canAccessRoute(user, item.path)) return false;
    if (
      leadershipNav &&
      (item.path === "/leave-management" ||
        item.path === "/attendance-management" ||
        item.path === "/recent-employees") &&
      !canManageLeaves(user)
    ) {
      return false;
    }
    return true;
  });

  const useGroupedNav = leadershipNav || isFinanceRoleOnly(user);

  const navSections = useMemo(() => {
    if (!useGroupedNav) {
      return [{ section: null as string | null, items: visibleNav }];
    }
    const ungrouped = visibleNav.filter((item) => !item.section);
    const groups = SECTION_ORDER.map((section) => ({
      section,
      items: visibleNav.filter((item) => item.section === section),
    })).filter((group) => group.items.length > 0);

    return [
      ...(ungrouped.length ? [{ section: null as string | null, items: ungrouped }] : []),
      ...groups,
    ];
  }, [useGroupedNav, visibleNav]);

  const isActive = (item: NavItem | string) => {
    const path = typeof item === "string" ? item : item.path;
    if (typeof item !== "string" && item.matchActive === false) return false;
    if (path === "/") return location.pathname === "/";
    if (path === "/tasks") {
      return (
        location.pathname === "/tasks" ||
        location.pathname.startsWith("/tasks/")
      );
    }
    if (path === "/admin/tasks") {
      return (
        location.pathname === "/admin/tasks" ||
        location.pathname.startsWith("/admin/tasks/")
      );
    }
    if (path === "/admin/client-tasks") {
      return (
        location.pathname === "/admin/client-tasks" ||
        location.pathname.startsWith("/admin/client-tasks/")
      );
    }
    if (path === "/admin/employees") {
      return (
        location.pathname === "/admin/employees" ||
        location.pathname.startsWith("/admin/employees/")
      );
    }
    if (path === "/admin/departments") {
      return (
        location.pathname === "/admin/departments" ||
        location.pathname.startsWith("/admin/departments/")
      );
    }
    if (path === "/projects") {
      if (/\/projects\/[^/]+\/tasks\//i.test(location.pathname)) return false;
      return location.pathname.startsWith("/projects");
    }
    return location.pathname.startsWith(path);
  };

  const handleNav = (path: string) => {
    if (path === "/" && location.pathname === "/") {
      requestDashboardRefresh();
      return;
    }
    onNavigate(path);
  };

  const renderNavItem = (item: NavItem) => {
    const active = isActive(item);
    if (leadershipNav) {
      return (
        <button
          key={item.id ?? item.path}
          type="button"
          onClick={() => handleNav(item.path)}
          style={
            !SHOW_LOCATION_QR_MENU && isLocationQrMenuPath(item.path)
              ? { display: "none" }
              : undefined
          }
          aria-hidden={
            !SHOW_LOCATION_QR_MENU && isLocationQrMenuPath(item.path)
              ? true
              : undefined
          }
          tabIndex={
            !SHOW_LOCATION_QR_MENU && isLocationQrMenuPath(item.path) ? -1 : undefined
          }
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 group relative ${
            active
              ? "bg-white/20 text-white dark:bg-[#2563EB]/25 dark:text-[#93C5FD]"
              : "text-white/90 hover:bg-white/10 dark:text-slate-400 dark:hover:text-white dark:hover:bg-white/[0.06]"
          }`}
        >
          <item.icon size={18} className="shrink-0" />
          {!collapsed && (
            <>
              <span className="flex-1 text-left">{item.label}</span>
              {item.expandable ? (
                <ChevronDown
                  size={14}
                  className={`opacity-70 transition-transform ${timeHoursOpen ? "rotate-0" : "-rotate-90"}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setTimeHoursOpen((v) => !v);
                  }}
                />
              ) : null}
              {item.badge ? (
                <span className="bg-white text-[#1e3a5f] text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 dark:bg-[#38BDF8] dark:text-[#0a0e14]">
                  {item.badge}
                </span>
              ) : null}
            </>
          )}
        </button>
      );
    }

    return (
    <button
      key={item.id ?? item.path}
      type="button"
      onClick={() => handleNav(item.path)}
      style={
        !SHOW_LOCATION_QR_MENU && isLocationQrMenuPath(item.path)
          ? { display: "none" }
          : undefined
      }
      aria-hidden={
        !SHOW_LOCATION_QR_MENU && isLocationQrMenuPath(item.path)
          ? true
          : undefined
      }
      tabIndex={
        !SHOW_LOCATION_QR_MENU && isLocationQrMenuPath(item.path) ? -1 : undefined
      }
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 group relative ${
        active
          ? "bg-white/20 text-white dark:bg-[#2563EB]/25 dark:text-[#93C5FD]"
          : "text-white hover:bg-white/10 dark:text-slate-300 dark:hover:text-white dark:hover:bg-white/[0.06]"
      }`}
    >
      <item.icon size={20} className="shrink-0" />
      {!collapsed && (
        <>
          <span className="flex-1 text-left">
            {item.label}
          </span>
          {item.badge ? (
            <span className="bg-white text-[#1e3a5f] text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 dark:bg-[#38BDF8] dark:text-[#0b1220]">
              {item.badge}
            </span>
          ) : null}
        </>
      )}
      {collapsed && item.badge ? (
        <span className="absolute -top-1 -right-1 bg-white text-[#1e3a5f] text-[8px] font-bold rounded-full w-4 h-4 flex items-center justify-center dark:bg-[#38BDF8] dark:text-[#0b1220]">
          {item.badge}
        </span>
      ) : null}
    </button>
    );
  };

  return (
    <div className="relative flex h-full flex-col bg-gradient-to-b from-[#1e3a5f] via-[#2563EB] to-[#1e40af] dark:bg-none dark:bg-[#0a0e14] dark:border-r dark:border-[#1e293b] sidebar-chrome">
      <div
        className="pointer-events-none absolute inset-0 opacity-25 bg-[radial-gradient(circle_at_top,_white,_transparent_55%)] dark:opacity-30 dark:bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.12),_transparent_50%)]"
        aria-hidden
      />
      <div
        className={`relative h-14 sm:h-16 flex items-center border-b border-white/15 dark:border-[#1e293b] ${
          collapsed ? "justify-center px-2" : "gap-3 px-4"
        }`}
      >
        {collapsed ? (
          <BrandLogo mark />
        ) : (
          <div className="min-w-0 flex-1">
            <BrandLogo variant="dark" imgClassName="h-7 sm:h-8" />
          </div>
        )}
        {showCollapseToggle ? (
          <button
            type="button"
            onClick={onToggle}
            className={
              collapsed
                ? "absolute top-1/2 -translate-y-1/2 -right-3 z-[130] flex h-7 w-7 items-center justify-center rounded-full bg-white text-[#1e3a5f] shadow-md border border-white/80 hover:bg-blue-50 transition-colors dark:bg-[#151c2c] dark:text-gray-100 dark:border-[#2d3a4f] dark:hover:bg-[#1a2336]"
                : "ml-auto flex h-8 w-8 items-center justify-center rounded-lg text-white hover:bg-white/10 transition-colors dark:hover:bg-white/5"
            }
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? (
              <ChevronRight size={16} strokeWidth={2.5} />
            ) : (
              <ChevronLeft size={16} />
            )}
          </button>
        ) : null}
      </div>

      <nav className="relative flex-1 overflow-y-auto overflow-x-hidden scrollbar-thin py-4 px-2 space-y-1">
        {navSections.map((group, groupIndex) => (
          <div
            key={group.section ?? `top-${groupIndex}`}
            className={groupIndex > 0 ? "pt-3 mt-1" : undefined}
          >
            {group.section && !collapsed ? (
              <p
                className={
                  leadershipNav
                    ? "px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45"
                    : "px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/45"
                }
              >
                {group.section}
              </p>
            ) : null}
            {group.section && collapsed && groupIndex > 0 ? (
              <div
                className={
                  leadershipNav
                    ? "mx-2 mb-2 border-t border-white/15"
                    : "mx-2 mb-2 border-t border-white/15"
                }
                aria-hidden
              />
            ) : null}
            <div className="space-y-1">{group.items.map(renderNavItem)}</div>
          </div>
        ))}
      </nav>

      <div
        className={
          leadershipNav
            ? "relative border-t border-white/15 p-3 space-y-3 overflow-hidden dark:border-[#1e293b]"
            : "relative border-t border-white/15 dark:border-[#1e293b] p-2 space-y-1 overflow-hidden"
        }
      >
        
        {leadershipNav ? null : (
        <button
          type="button"
          onClick={() => handleNav("/settings")}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
            isActive("/settings")
              ? "bg-white/20 text-white dark:bg-[#2563EB]/25 dark:text-[#93C5FD]"
              : "text-white hover:bg-white/10 dark:text-slate-300 dark:hover:text-white dark:hover:bg-white/[0.06]"
          }`}
        >
          <Settings size={20} className="shrink-0" />
          {!collapsed && <span>Settings</span>}
        </button>
        )}

        <button
          type="button"
          onClick={logout}
          className={
            leadershipNav
              ? "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-white/90 hover:text-white hover:bg-white/10 dark:text-slate-400 dark:hover:text-white dark:hover:bg-white/[0.06] transition-all duration-150"
              : "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-white hover:bg-white/10 dark:hover:bg-[#151c2c]/80 transition-all duration-150"
          }
        >
          <LogOut size={20} className="shrink-0" />
          {!collapsed && <span>Logout</span>}
        </button>
      </div>
    </div>
  );
}

export function Sidebar({
  collapsed,
  onToggle,
  drawerOpen,
  onDrawerOpenChange,
}: SidebarProps) {
  const { user } = useAuth();
  const clientPortal = isClientPortalUser(user);
  const layoutMode = useLayoutMode();
  const navigate = useNavigate();
  const isDrawer = layoutMode === "drawer";
  const sidebarWidth =
    clientPortal && !isDrawer
      ? collapsed
        ? 56
        : 244
      : getSidebarWidth(layoutMode, collapsed);

  const handleNavigate = (path: string) => {
    navigate(path);
    if (isDrawer) {
      onDrawerOpenChange(false);
    }
  };

  const panel = clientPortal ? (
    <ClientSidebarPanel
      collapsed={isDrawer ? false : collapsed}
      showCollapseToggle={!isDrawer}
      onToggle={onToggle}
      onNavigate={handleNavigate}
    />
  ) : (
    <SidebarPanel
      collapsed={isDrawer ? false : collapsed}
      showCollapseToggle={!isDrawer}
      onToggle={onToggle}
      onNavigate={handleNavigate}
    />
  );

  if (isDrawer) {
    return (
      <Sheet open={drawerOpen} onOpenChange={onDrawerOpenChange}>
        <SheetContent
          side="left"
          className="w-[min(280px,85vw)] max-w-[85vw] p-0 border-0 bg-transparent shadow-2xl [&>button]:hidden z-[140]"
        >
          {panel}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <aside
      className="fixed left-0 top-0 h-screen flex flex-col z-[120] transition-all duration-300 overflow-visible"
      style={{ width: sidebarWidth }}
    >
      {panel}
    </aside>
  );
}
