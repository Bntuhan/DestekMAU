import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth.jsx'
import './DashboardLayout.css'

function IconTickets() {
  return (
    <svg className="dash-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
    </svg>
  )
}

function IconPlus() {
  return (
    <svg className="dash-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
    </svg>
  )
}

function IconAssign() {
  return (
    <svg className="dash-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <circle cx="9" cy="7.5" r="3.25" strokeLinecap="round" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 20v-1.2c0-2.4 3-4.3 5-4.3M17 11h.01M17 11a3 3 0 11-.01 0M20 20v-1.2c0-1.33-1.4-2.5-3-3.2" />
    </svg>
  )
}

function IconAddUser() {
  return (
    <svg className="dash-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
    </svg>
  )
}

export default function DashboardLayout() {
  const { user, signOut, isManager, isSupport } = useAuth()
  const navigate = useNavigate()

  function logout() {
    signOut()
    navigate('/', { replace: true })
  }

  return (
    <div className="dash">
      <aside className="dash-sidebar" aria-label="Ana menü">
        <div className="dash-brand">
          <div className="dash-logo-wrap">
            <img src="/maltepe-logo.png" alt="Logo" className="dash-logo" />
            <div className="dash-user">
              <span className="dash-user-name">{user?.display_name}</span>
              <span className="dash-user-meta">Maltepe Üniversitesi · Destek</span>
            </div>
          </div>
        </div>
        <nav className="dash-nav">
          <NavLink to="/app" end className="dash-nav-link">
            <IconTickets />
            Talepler
          </NavLink>
          {!isSupport && (
            <NavLink to="/app/yeni-talep" className="dash-nav-link">
              <IconPlus />
              Yeni talep
            </NavLink>
          )}
          {isManager ? (
            <>
              <NavLink to="/app/kullanici-ekle" className="dash-nav-link">
                <IconAddUser />
                Yeni Kişi
              </NavLink>
              <NavLink to="/app/atama" className="dash-nav-link">
                <IconAssign />
                Atama
              </NavLink>
            </>
          ) : null}
        </nav>
        <div className="dash-sidebar-footer">
          <button type="button" className="dash-logout" onClick={logout}>
            Oturumu kapat
          </button>
          <div className="dash-legal">Gizlilik · Şartlar · Erişilebilirlik</div>
        </div>
      </aside>
      <main className="dash-main">
        <div className="dash-main-inner">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
