/* eslint-disable */
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { useAuth } from '../auth.jsx'
import * as api from '../api.js'
import { useSettings, useTranslation } from '../settings.jsx'
import { playSound, isSoundEnabled, toggleSound } from '../utils/sound.js'
import CommandPalette from '../components/CommandPalette.jsx'
import { useSessionTimeout } from '../hooks/useSessionTimeout.js'
import ShortcutsHelp from '../components/ShortcutsHelp.jsx'
import AnnouncementBanner from '../components/AnnouncementBanner.jsx'
import OnboardingTour from '../components/OnboardingTour.jsx'
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

function IconDashboard() {
  return (
    <svg className="dash-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z" />
    </svg>
  )
}

export default function DashboardLayout() {
  const { user, signOut, isManager, isSupport } = useAuth()
  const { theme, setTheme, lang, setLang } = useSettings()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [soundOn, setSoundOn] = useState(isSoundEnabled())
  
  const [notifications, setNotifications] = useState([])
  const [showNotifications, setShowNotifications] = useState(false)
  const [toasts, setToasts] = useState([])
  
  const [cmdOpen, setCmdOpen] = useState(false)
  const [cmdTickets, setCmdTickets] = useState([])

  const { showWarning, countdown, resetTimer } = useSessionTimeout()
  const [shortcutsOpen, setShortcutsOpen] = useState(false)

  useEffect(() => {
    async function fetchNotifs() {
      try {
        const data = await api.fetchNotifications()
        if (Array.isArray(data)) {
          setNotifications(prev => {
            const prevIds = new Set(prev.map(n => n.id))
            const newNotifs = data.filter(n => !prevIds.has(n.id) && !n.is_read)
            if (prev.length > 0 && newNotifs.length > 0) {
              newNotifs.forEach(n => {
                const toastId = Math.random().toString(36).substring(2, 9)
                setToasts(ts => [...ts, { id: toastId, message: n.message, link: n.link }])
                setTimeout(() => {
                  setToasts(ts => ts.filter(t => t.id !== toastId))
                }, 7000) // Toast disappears after 7 seconds
              })
            }
            return data
          })
        }
      } catch (e) {
        console.error("Bildirimler çekilemedi")
      }
    }
    fetchNotifs()
    const intv = setInterval(fetchNotifs, 30000) // Lower back up to 30s as SSE handles realtime
    
    // Server-Sent Events (SSE) Dinleyicisi
    const token = localStorage.getItem("destek_token")
    let source = null
    if (token) {
        source = new EventSource(`/api/stream?token=${token}`)
        
        const notifySSE = (msg, link) => {
           playSound('notify')
           setToasts(ts => {
             const toastId = Math.random().toString(36).substring(2, 9)
             setTimeout(() => setToasts(t => t.filter(x => x.id !== toastId)), 7000)
             return [...ts, { id: toastId, message: msg, link }]
           })
           fetchNotifs()
        }

        source.addEventListener("ticket_created", (e) => {
            notifySSE("🎫 Yeni talep oluşturuldu: #" + e.data, `/app/talep/${e.data}`)
        })
        source.addEventListener("ticket_closed", (e) => {
            notifySSE("✅ Talebiniz kapatıldı: #" + e.data, `/app/talep/${e.data}`)
        })
        source.addEventListener("ticket_comment", (e) => {
            notifySSE("💬 Talep #" + e.data + " için yeni yorum", `/app/talep/${e.data}`)
        })
    }
    
    // CommandPalette listener
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setCmdOpen(prev => {
          if (!prev) {
            // Load tickets when opening
            api.fetchTickets('all').then(data => {
              if (Array.isArray(data)) setCmdTickets(data)
            }).catch(() => {})
          }
          return !prev
        })
      }
      if (e.key === '?' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
        setShortcutsOpen(true)
      }
    }
    window.addEventListener('keydown', handleKeyDown)

    return () => {
        clearInterval(intv)
        if (source) source.close()
        window.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  async function handleRead(id, link) {
    try {
      await api.markNotificationRead(id)
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n))
      if (link) {
        navigate(link)
      }
      setShowNotifications(false)
    } catch(e) {}
  }

  function logout() {
    signOut()
    navigate('/', { replace: true })
  }

  function toggleTheme() {
    setTheme(v => v === 'light' ? 'dark' : 'light')
  }

  function toggleLang() {
    setLang(v => v === 'tr' ? 'en' : 'tr')
  }

  return (
    <div className="dash">
      <aside className="dash-sidebar" aria-label="Ana menü">
        <div className="dash-brand">
          <div className="dash-logo-wrap">
            <img src="/maltepe-logo.png" alt="Logo" className="dash-logo" />
            <div className="dash-user" style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%'}}>
              <div>
                <span className="dash-user-name">{user?.display_name}</span>
                <span className="dash-user-meta">Maltepe Üniversitesi · Destek</span>
              </div>
              <div style={{position: 'relative'}}>
                <button 
                  onClick={() => setShowNotifications(!showNotifications)} 
                  style={{background: 'transparent', border: 'none', cursor: 'pointer', position: 'relative', fontSize: '1.2rem', marginLeft: '8px'}}
                  title="Bildirimler"
                >
                  🔔
                  {notifications.filter(n => !n.is_read).length > 0 && (
                    <span style={{position:'absolute', top: '-2px', right: '-8px', background: '#dc3545', color: 'white', borderRadius: '50%', padding: '2px 5px', fontSize: '0.65rem', fontWeight: 'bold'}}>
                      {notifications.filter(n => !n.is_read).length}
                    </span>
                  )}
                </button>
                {showNotifications && (
                  <div className="notif-dropdown">
                    <h4 className="notif-dropdown__title">Bildirimler</h4>
                    {notifications.length === 0 ? (
                      <div className="notif-dropdown__empty">Yeni bildirim yok.</div>
                    ) : notifications.map(n => (
                      <div key={n.id} onClick={() => handleRead(n.id, n.link)} className={`notif-item${n.is_read ? '' : ' notif-item--unread'}`}>
                        <div className="notif-item__message">{n.message}</div>
                        <div className="notif-item__date">{new Date(n.created_at).toLocaleString('tr-TR')}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        <nav className="dash-nav">
          <NavLink to="/app" end className="dash-nav-link" id="nav-tickets">
            <IconTickets />
            {t.tickets}
          </NavLink>
          {!isSupport && (
            <NavLink to="/app/yeni-talep" className="dash-nav-link" id="nav-new-ticket">
              <IconPlus />
              {t.newTicket}
            </NavLink>
          )}
          {isManager ? (
            <>
              <NavLink to="/app/dashboard" className="dash-nav-link" id="nav-analysis">
                <IconDashboard />
                Analiz
              </NavLink>
              <NavLink to="/app/kanban" className="dash-nav-link" id="nav-kanban">
                <svg className="dash-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
                  <rect x="3" y="3" width="5" height="18" rx="1"/>
                  <rect x="10" y="3" width="5" height="12" rx="1"/>
                  <rect x="17" y="3" width="5" height="15" rx="1"/>
                </svg>
                Kanban
              </NavLink>
              <NavLink to="/app/kullanici-ekle" className="dash-nav-link">
                <IconAddUser />
                {t.newUser}
              </NavLink>
              <NavLink to="/app/atama" className="dash-nav-link">
                <IconAssign />
                {t.assign}
              </NavLink>
            </>
          ) : null}
          <NavLink to="/app/profil" className="dash-nav-link">
            <svg className="dash-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
              <circle cx="12" cy="8" r="4"/>
              <path strokeLinecap="round" d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
            </svg>
            Profil
          </NavLink>
          <NavLink to="/app/faq" className="dash-nav-link">
            <svg className="dash-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
              <circle cx="12" cy="12" r="10"/>
              <path strokeLinecap="round" d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3M12 17h.01"/>
            </svg>
            SSS
          </NavLink>
          {isManager ? (
            <>
              <NavLink to="/app/duyurular" className="dash-nav-link">
                <svg className="dash-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z"/>
                </svg>
                Duyurular
              </NavLink>
              <NavLink to="/app/audit-log" className="dash-nav-link">
                <svg className="dash-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                </svg>
                Denetim Günlüğü
              </NavLink>
            </>
          ) : null}
        </nav>
        <div className="dash-sidebar-footer">
          <button type="button" className="dash-nav-link dash-footer-btn" onClick={toggleTheme}>
            {theme === 'light' ? '🌙' : '☀️'}
            <span>{t.themeToggle}</span>
          </button>
          <button type="button" className="dash-nav-link dash-footer-btn" onClick={() => { const v = toggleSound(); setSoundOn(v) }}>
            {soundOn ? '🔔' : '🔕'}
            <span>{soundOn ? 'Ses Açık' : 'Ses Kapalı'}</span>
          </button>
          <button type="button" className="dash-nav-link dash-footer-btn" onClick={toggleLang}>
            🌍
            <span>{t.langToggle}</span>
          </button>
          <button type="button" className="dash-logout" onClick={logout}>
            {t.logout}
          </button>
          <div className="dash-legal">Gizlilik · Şartlar · Erişilebilirlik</div>
        </div>
      </aside>
      <main className="dash-main">
        <div className="dash-main-inner">
          <AnnouncementBanner />
          <Outlet />
        </div>

        {/* Toasts Container */}
        <div className="toast-container">
          {toasts.map(toast => (
            <div
              key={toast.id}
              className={`toast-item${toast.link ? ' toast-item--clickable' : ''}`}
              onClick={() => { if (toast.link) navigate(toast.link) }}
              role="alert"
              aria-live="polite"
            >
              <div className="toast-label">YENİ BİLDİRİM</div>
              <div className="toast-message">{toast.message}</div>
            </div>
          ))}
        </div>

        <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} tickets={cmdTickets} />
        
        {showWarning && (
          <div className="session-warning-overlay">
            <div className="session-warning-modal">
              <h2>Oturum Zaman Aşımı</h2>
              <p>Uzun süredir işlem yapmadınız. Oturumunuz kapanmak üzere.</p>
              <div className="session-warning-countdown">{countdown}</div>
              <button className="mau-btn mau-btn--primary" onClick={resetTimer}>Devam Et</button>
            </div>
          </div>
        )}
        
        
        <ShortcutsHelp open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
        <OnboardingTour />
      </main>
    </div>
  )
}
