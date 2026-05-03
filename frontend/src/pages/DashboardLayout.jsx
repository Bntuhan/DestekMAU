import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { useAuth } from '../auth.jsx'
import * as api from '../api.js'
import { useSettings, useTranslation } from '../settings.jsx'
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
  
  const [notifications, setNotifications] = useState([])
  const [showNotifications, setShowNotifications] = useState(false)
  const [toasts, setToasts] = useState([])

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
    fetchNotifs()
    const intv = setInterval(fetchNotifs, 30000) // Lower back up to 30s as SSE handles realtime
    
    // Server-Sent Events (SSE) Dinleyicisi
    const token = localStorage.getItem("token")
    let source = null
    if (token) {
        source = new EventSource(`/api/stream?token=${token}`)
        
        const notifySSE = (msg, link) => {
           setToasts(ts => {
             const toastId = Math.random().toString(36).substring(2, 9)
             setTimeout(() => setToasts(t => t.filter(x => x.id !== toastId)), 7000)
             return [...ts, { id: toastId, message: msg, link }]
           })
           fetchNotifs()
        }

        source.addEventListener("ticket_created", (e) => {
            notifySSE("Yeni talep oluşturuldu: #" + e.data, `/app/talep/${e.data}`)
        })
        source.addEventListener("ticket_closed", (e) => {
            notifySSE("Talebiniz kapatıldı: #" + e.data, `/app/talep/${e.data}`)
        })
    }
    
    return () => {
        clearInterval(intv)
        if (source) source.close()
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
                  <div style={{position: 'absolute', top: '120%', right: 0, width: '280px', maxHeight: '350px', overflowY: 'auto', background: 'white', border: '1px solid #eaeaea', borderRadius: '8px', zIndex: 100, boxShadow: '0 8px 24px rgba(0,0,0,0.12)'}}>
                    <h4 style={{padding: '12px 16px', margin: 0, borderBottom: '1px solid #eaeaea', fontSize: '0.9rem', color: '#333'}}>Bildirimler</h4>
                    {notifications.length === 0 ? (
                      <div style={{padding: '16px', color: '#666', fontSize: '0.85rem', textAlign: 'center'}}>Yeni bildirim yok.</div>
                    ) : notifications.map(n => (
                      <div key={n.id} onClick={() => handleRead(n.id, n.link)} style={{padding: '12px 16px', borderBottom: '1px solid #f5f5f5', backgroundColor: n.is_read ? 'white' : '#f0f8ff', cursor: 'pointer'}}>
                        <div style={{color: n.is_read ? '#555' : '#222', fontSize: '0.85rem', lineHeight: '1.4'}}>{n.message}</div>
                        <div style={{fontSize: '0.7rem', color: '#999', marginTop: '6px'}}>{new Date(n.created_at).toLocaleString('tr-TR')}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        <nav className="dash-nav">
          <NavLink to="/app" end className="dash-nav-link">
            <IconTickets />
            {t.tickets}
          </NavLink>
          {!isSupport && (
            <NavLink to="/app/yeni-talep" className="dash-nav-link">
              <IconPlus />
              {t.newTicket}
            </NavLink>
          )}
          {isManager ? (
            <>
              <NavLink to="/app/dashboard" className="dash-nav-link">
                <IconDashboard />
                Analiz
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
        </nav>
        <div className="dash-sidebar-footer">
          <button type="button" className="dash-nav-link" style={{background:'transparent', border:0, color:'inherit', cursor:'pointer', padding:'8px 12px', width:'100%', textAlign:'left', display:'flex', alignItems:'center', gap:'12px'}} onClick={toggleTheme}>
            {theme === 'light' ? '🌙' : '☀️'}
            <span>{t.themeToggle}</span>
          </button>
          <button type="button" className="dash-nav-link" style={{background:'transparent', border:0, color:'inherit', cursor:'pointer', padding:'8px 12px', width:'100%', textAlign:'left', display:'flex', alignItems:'center', gap:'12px', marginBottom:'16px'}} onClick={toggleLang}>
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
          <Outlet />
        </div>

        {/* Toasts Container */}
        <div style={{ position: 'fixed', bottom: '24px', right: '24px', zIndex: 9999, display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {toasts.map(t => (
            <div 
              key={t.id} 
              style={{
                background: 'white', 
                borderLeft: '4px solid var(--brand-primary)', 
                padding: '16px 20px', 
                borderRadius: '6px', 
                boxShadow: '0 8px 30px rgba(0,0,0,0.15)',
                minWidth: '300px',
                maxWidth: '400px',
                animation: 'slideInRight 0.3s ease-out forwards',
                cursor: t.link ? 'pointer' : 'default'
              }}
              onClick={() => {
                if (t.link) navigate(t.link)
              }}
            >
              <div style={{fontWeight: 'bold', fontSize: '0.85rem', color: '#666', marginBottom: '6px'}}>YENİ BİLDİRİM</div>
              <div style={{fontSize: '0.95rem', color: '#222'}}>{t.message}</div>
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
