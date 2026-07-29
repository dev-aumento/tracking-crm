import { Routes, Route, Navigate, Outlet, useParams, useSearchParams } from 'react-router'
import { AppLayout } from './components/layout/AppLayout'
import { useAuth } from './hooks/useAuth'
import { AUTH_DISABLED, LOGIN_PATH } from './const'
import { canAccessRoute, getDefaultHomePath, hasAnyPermission, hasPermission } from './lib/permissions'
import { isHrUser } from './lib/leave-policy'
import {
  buildAllTasksViewPath,
  buildMyTasksViewPath,
  parseActivityIdParam,
  parseTaskKeyParam,
} from './lib/task-notification-link'

// Pages
import Dashboard from './pages/Dashboard'
import Tasks from './pages/Tasks'
import TaskChats from './pages/TaskChats'
import TimeTracking from './pages/TimeTracking'
import Projects from './pages/Projects'
import ProjectDetail from './pages/ProjectDetail'
import Analytics from './pages/Analytics'
import Settings from './pages/Settings'
import NotFound from './pages/NotFound'

// Admin Pages
import AdminEmployees from './pages/admin/Employees'
import AdminAllTasks from './pages/admin/AllTasks'
import AdminPermissions from './pages/admin/Permissions'
import AdminInvoices from './pages/admin/Invoices'
import AdminCustomers from './pages/admin/Customers'
import Leaves from './pages/Leaves'
import LeaveManagement from './pages/LeaveManagement'
import AttendanceManagement from './pages/AttendanceManagement'
import RecentEmployees from './pages/RecentEmployees'
import InviteAccept from './pages/InviteAccept'
import Login from './pages/Login'

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F8F9FA] dark:bg-[#0b1220]">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-3 border-[#0EA5E9] border-t-transparent rounded-full animate-spin" />
        <span className="text-sm text-gray-500">Loading...</span>
      </div>
    </div>
  )
}

function RequireAuth() {
  const { user, isLoading } = useAuth()

  if (isLoading) return <LoadingScreen />
  if (!AUTH_DISABLED && !user) {
    return <Navigate to={LOGIN_PATH} replace />
  }

  return <Outlet />
}

function GuestOnly({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth()

  if (isLoading) return <LoadingScreen />
  if (!AUTH_DISABLED && user) {
    return <Navigate to={getDefaultHomePath(user)} replace />
  }

  return <>{children}</>
}

function ProtectedRoute({
  children,
  requireAdmin = false,
  requireManager = false,
  permission,
  anyPermission,
}: {
  children: React.ReactNode;
  requireAdmin?: boolean;
  requireManager?: boolean;
  permission?: string;
  anyPermission?: string[];
}) {
  const { user, isLoading } = useAuth()

  if (isLoading) return <LoadingScreen />

  if (requireAdmin && user?.role !== 'admin') {
    return <Navigate to={getDefaultHomePath(user)} replace />
  }

  if (requireManager && (user?.role === 'employee' || user?.role === 'hr' || user?.role === 'client')) {
    return <Navigate to={getDefaultHomePath(user)} replace />
  }

  if (permission && !hasPermission(user, permission)) {
    return <Navigate to={getDefaultHomePath(user)} replace />
  }

  if (anyPermission && !hasAnyPermission(user, anyPermission)) {
    return <Navigate to={getDefaultHomePath(user)} replace />
  }

  return <>{children}</>
}

function PermissionRoute({ path, children }: { path: string; children: React.ReactNode }) {
  const { user, isLoading } = useAuth()

  if (isLoading) return <LoadingScreen />
  if (!canAccessRoute(user, path)) {
    return <Navigate to={getDefaultHomePath(user)} replace />
  }

  return <>{children}</>
}

/** Shared /projects/.../tasks/task=ID links open under All tasks (or My tasks if no access). */
function SharedTaskLinkRedirect() {
  const { user, isLoading } = useAuth()
  const { taskKey } = useParams()
  const [searchParams] = useSearchParams()
  const taskId = parseTaskKeyParam(taskKey)
  const activityId = parseActivityIdParam(searchParams.get('activity'))

  if (isLoading) return <LoadingScreen />
  if (!taskId) return <Navigate to="/tasks" replace />
  if (isHrUser(user)) return <Navigate to={getDefaultHomePath(user)} replace />

  const canViewAll =
    user?.role === 'admin' || hasPermission(user, 'tasks.view_all')

  return (
    <Navigate
      to={
        canViewAll
          ? buildAllTasksViewPath(taskId, activityId)
          : buildMyTasksViewPath(taskId, activityId)
      }
      replace
    />
  )
}

export default function App() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <GuestOnly>
            <Login />
          </GuestOnly>
        }
      />
      <Route path="/invite/:token" element={<InviteAccept />} />
      <Route path="*" element={<NotFound />} />

      <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={
            <PermissionRoute path="/"><Dashboard /></PermissionRoute>
          } />
          <Route path="/tasks" element={
            <PermissionRoute path="/tasks"><Tasks /></PermissionRoute>
          } />
          <Route path="/tasks/chats" element={<Navigate to="/task-chats" replace />} />
          <Route path="/tasks/:taskKey/*" element={
            <PermissionRoute path="/tasks"><Tasks /></PermissionRoute>
          } />
          <Route path="/tasks/task/view/:taskId/*" element={
            <PermissionRoute path="/tasks"><Tasks /></PermissionRoute>
          } />
          <Route path="/task-chats" element={
            <PermissionRoute path="/task-chats"><TaskChats /></PermissionRoute>
          } />
          <Route path="/kanban" element={<Navigate to="/tasks?view=kanban" replace />} />
          <Route path="/time-tracking" element={
            <PermissionRoute path="/time-tracking"><TimeTracking /></PermissionRoute>
          } />
          <Route path="/inbox" element={<Navigate to="/" replace />} />
          <Route path="/projects" element={
            <PermissionRoute path="/projects"><Projects /></PermissionRoute>
          } />
          <Route path="/projects/:projectSlug/tasks/:taskKey/*" element={
            <SharedTaskLinkRedirect />
          } />
          <Route path="/projects/:id" element={
            <PermissionRoute path="/projects"><ProjectDetail /></PermissionRoute>
          } />
          <Route path="/settings" element={<Settings />} />
          <Route path="/admin/hours" element={<Navigate to="/time-tracking" replace />} />
          <Route path="/working-hours" element={<Navigate to="/time-tracking" replace />} />
          <Route path="/analytics" element={
            <PermissionRoute path="/analytics">
              <Analytics />
            </PermissionRoute>
          } />
          <Route path="/leaves" element={
            <PermissionRoute path="/leaves">
              <Leaves />
            </PermissionRoute>
          } />
          <Route path="/leave" element={<Navigate to="/leaves" replace />} />
          <Route path="/leave-management" element={<LeaveManagement />} />
          <Route path="/attendance-management" element={<AttendanceManagement />} />
          <Route path="/recent-employees" element={<RecentEmployees />} />

          {/* Admin Routes */}
          <Route path="/admin/employees" element={
            <PermissionRoute path="/admin/employees">
              <AdminEmployees />
            </PermissionRoute>
          } />
          <Route path="/admin/tasks" element={
            <PermissionRoute path="/admin/tasks">
              <AdminAllTasks />
            </PermissionRoute>
          } />
          <Route path="/admin/tasks/:taskKey/*" element={
            <PermissionRoute path="/admin/tasks">
              <AdminAllTasks />
            </PermissionRoute>
          } />
          <Route path="/admin/permissions" element={
            <PermissionRoute path="/admin/permissions">
              <AdminPermissions />
            </PermissionRoute>
          } />
          <Route path="/admin/invoices" element={
            <PermissionRoute path="/admin/invoices">
              <AdminInvoices />
            </PermissionRoute>
          } />
          <Route path="/admin/invoices/new" element={
            <PermissionRoute path="/admin/invoices">
              <AdminInvoices />
            </PermissionRoute>
          } />
          <Route path="/admin/invoices/:invoiceId" element={
            <PermissionRoute path="/admin/invoices">
              <AdminInvoices />
            </PermissionRoute>
          } />
          <Route path="/admin/invoices/:invoiceId/edit" element={
            <PermissionRoute path="/admin/invoices">
              <AdminInvoices />
            </PermissionRoute>
          } />
          <Route path="/admin/customers" element={
            <PermissionRoute path="/admin/customers">
              <AdminCustomers />
            </PermissionRoute>
          } />
          <Route path="/admin/customers/new" element={
            <PermissionRoute path="/admin/customers">
              <AdminCustomers />
            </PermissionRoute>
          } />
          <Route path="/admin/customers/:customerId" element={
            <PermissionRoute path="/admin/customers">
              <AdminCustomers />
            </PermissionRoute>
          } />
          <Route path="/admin/customers/:customerId/edit" element={
            <PermissionRoute path="/admin/customers">
              <AdminCustomers />
            </PermissionRoute>
          } />
        </Route>
      </Route>
    </Routes>
  )
}
