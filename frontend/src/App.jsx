import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth, AuthProvider } from './auth.jsx'
import { SettingsProvider } from './settings.jsx'
import LoginPage from './pages/LoginPage.jsx'
import DashboardLayout from './pages/DashboardLayout.jsx'
import Dashboard from './pages/Dashboard.jsx'
import StreamPage from './pages/StreamPage.jsx'
import NewTicketPage from './pages/NewTicketPage.jsx'
import AssignPage from './pages/AssignPage.jsx'
import NewUserPage from './pages/NewUserPage.jsx'
import TicketDetailPage from './pages/TicketDetailPage.jsx'
import KanbanPage from './pages/KanbanPage.jsx'
import ProfilePage from './pages/ProfilePage.jsx'
import FaqPage from './pages/FaqPage.jsx'
import AnnouncementsPage from './pages/AnnouncementsPage.jsx'
import AuditLogPage from './pages/AuditLogPage.jsx'

function PrivateRoute({ children }) {
  const { user, ready } = useAuth()
  if (!ready) {
    return (
      <div className="app-boot">
        <p>Yükleniyor…</p>
      </div>
    )
  }
  if (!user) return <Navigate to="/" replace />
  return children
}

function ManagerRoute({ children }) {
  const { user, ready, isManager } = useAuth()
  if (!ready) {
    return (
      <div className="app-boot">
        <p>Yükleniyor…</p>
      </div>
    )
  }
  if (!user) return <Navigate to="/" replace />
  if (!isManager) return <Navigate to="/app" replace />
  return children
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LoginPage />} />
      <Route
        path="/app"
        element={
          <PrivateRoute>
            <DashboardLayout />
          </PrivateRoute>
        }
      >
        <Route index element={<StreamPage />} />
        <Route path="yeni-talep" element={<NewTicketPage />} />
        <Route path="talep/:id" element={<TicketDetailPage />} />
        <Route
          path="kullanici-ekle"
          element={
            <ManagerRoute>
              <NewUserPage />
            </ManagerRoute>
          }
        />
        <Route
          path="dashboard"
          element={
            <ManagerRoute>
              <Dashboard />
            </ManagerRoute>
          }
        />
        <Route
          path="atama"
          element={
            <ManagerRoute>
              <AssignPage />
            </ManagerRoute>
          }
        />
        <Route path="kanban" element={<KanbanPage />} />
        <Route path="profil" element={<ProfilePage />} />
        <Route path="faq" element={<FaqPage />} />
        <Route
          path="duyurular"
          element={
            <ManagerRoute>
              <AnnouncementsPage />
            </ManagerRoute>
          }
        />
        <Route
          path="audit-log"
          element={
            <ManagerRoute>
              <AuditLogPage />
            </ManagerRoute>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
