import { Routes, Route, Navigate, Outlet } from 'react-router'
import { AppLayout } from './components/layout/AppLayout'
import { useAuth } from './hooks/useAuth'
import { AUTH_DISABLED, LOGIN_PATH } from './const'
import { canAccessRoute, hasAnyPermission, hasPermission } from './lib/permissions'

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
import InviteAccept from './pages/InviteAccept'
import Login from './pages/Login'

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F8F9FA]">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-3 border-[#E2352D] border-t-transparent rounded-full animate-spin" />
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
    return <Navigate to="/" replace />
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
    return <Navigate to="/" replace />
  }

  if (requireManager && user?.role === 'employee') {
    return <Navigate to="/" replace />
  }

  if (permission && !hasPermission(user, permission)) {
    return <Navigate to="/" replace />
  }

  if (anyPermission && !hasAnyPermission(user, anyPermission)) {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}

function PermissionRoute({ path, children }: { path: string; children: React.ReactNode }) {
  const { user, isLoading } = useAuth()

  if (isLoading) return <LoadingScreen />
  if (!canAccessRoute(user, path)) {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
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
          <Route path="/task-chats" element={
            <PermissionRoute path="/task-chats"><TaskChats /></PermissionRoute>
          } />
          <Route path="/kanban" element={<Navigate to="/tasks?view=list" replace />} />
          <Route path="/tasks/chats" element={<Navigate to="/task-chats" replace />} />
          <Route path="/time-tracking" element={
            <PermissionRoute path="/time-tracking"><TimeTracking /></PermissionRoute>
          } />
          <Route path="/inbox" element={<Navigate to="/" replace />} />
          <Route path="/projects" element={
            <PermissionRoute path="/projects"><Projects /></PermissionRoute>
          } />
          <Route path="/projects/:id" element={
            <PermissionRoute path="/projects"><ProjectDetail /></PermissionRoute>
          } />
          <Route path="/settings" element={<Settings />} />
          <Route path="/admin/hours" element={<Navigate to="/time-tracking" replace />} />
          <Route path="/working-hours" element={<Navigate to="/time-tracking" replace />} />
          <Route path="/analytics" element={
            <ProtectedRoute anyPermission={['analytics.view']}>
              <Analytics />
            </ProtectedRoute>
          } />

          {/* Admin Routes */}
          <Route path="/admin/employees" element={
            <ProtectedRoute requireAdmin permission="employees.manage">
              <AdminEmployees />
            </ProtectedRoute>
          } />
          <Route path="/admin/tasks" element={
            <ProtectedRoute anyPermission={['tasks.view_all']}>
              <AdminAllTasks />
            </ProtectedRoute>
          } />
          <Route path="/admin/permissions" element={
            <ProtectedRoute requireAdmin permission="permissions.manage">
              <AdminPermissions />
            </ProtectedRoute>
          } />
        </Route>
      </Route>
    </Routes>
  )
}
