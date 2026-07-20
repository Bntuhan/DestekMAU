import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import './CommandPalette.css'

export default function CommandPalette({ open, onClose, tickets = [] }) {
  const navigate = useNavigate()
  const inputRef = useRef(null)
  const [search, setSearch] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)

  // Sayfalar her zaman gösterilsin
  const pages = [
    { type: 'page', title: 'Talep Akışı', path: '/app' },
    { type: 'page', title: 'Yeni Talep', path: '/app/yeni-talep' },
    { type: 'page', title: 'Analiz', path: '/app/dashboard' },
    { type: 'page', title: 'Kanban', path: '/app/kanban' },
    { type: 'page', title: 'Profil', path: '/app/profil' }
  ]

  const filteredPages = pages.filter(p => p.title.toLowerCase().includes(search.toLowerCase()))
  const filteredTickets = search ? tickets.filter(t => t.title.toLowerCase().includes(search.toLowerCase()) || String(t.id).includes(search)).map(t => ({...t, type: 'ticket'})) : []

  const results = [
    ...(filteredPages.length > 0 ? [{ type: 'header', title: 'SAYFALAR' }, ...filteredPages] : []),
    ...(filteredTickets.length > 0 ? [{ type: 'header', title: 'TALEPLER' }, ...filteredTickets] : [])
  ]

  // Filter out headers for navigation index
  const navItems = results.filter(r => r.type !== 'header')

  useEffect(() => {
    if (open) {
      setSearch('')
      setSelectedIndex(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  useEffect(() => {
    setSelectedIndex(0)
  }, [search])

  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        if (open) onClose()
        else {
          // If not open, we can't open it from here easily without lifting state higher,
          // but state is in DashboardLayout. We assume DashboardLayout handles Cmd+K to open.
        }
      }
      if (!open) return
      if (e.key === 'Escape') {
        onClose()
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex(i => (i + 1) % navItems.length)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex(i => (i - 1 + navItems.length) % navItems.length)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const selected = navItems[selectedIndex]
        if (selected) {
          if (selected.type === 'page') {
            navigate(selected.path)
          } else if (selected.type === 'ticket') {
            navigate(`/app/talep/${selected.id}`)
          }
          onClose()
        }
      }
    }
    window.addEventListener('keydown', handleGlobalKeyDown)
    return () => window.removeEventListener('keydown', handleGlobalKeyDown)
  }, [open, navItems, selectedIndex, navigate, onClose])

  if (!open) return null

  return (
    <div className="cmd-backdrop" onClick={onClose}>
      <div className="cmd-modal" onClick={e => e.stopPropagation()}>
        <div className="cmd-header">
          <svg className="cmd-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input
            ref={inputRef}
            className="cmd-input"
            placeholder="Bir şey arayın veya bir komut yazın..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="cmd-body">
          {results.length === 0 ? (
            <div className="cmd-empty">Sonuç bulunamadı.</div>
          ) : (
            results.map((r, i) => {
              if (r.type === 'header') {
                return <div key={`h-${i}`} className="cmd-header-label">{r.title}</div>
              }
              const isSelected = navItems[selectedIndex] === r
              return (
                <div
                  key={r.type === 'page' ? r.path : r.id}
                  className={`cmd-item ${isSelected ? 'cmd-item--selected' : ''}`}
                  onMouseEnter={() => setSelectedIndex(navItems.indexOf(r))}
                  onClick={() => {
                    if (r.type === 'page') navigate(r.path)
                    else navigate(`/app/talep/${r.id}`)
                    onClose()
                  }}
                >
                  {r.type === 'page' ? (
                    <div className="cmd-item-title">
                      <svg className="cmd-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      {r.title}
                    </div>
                  ) : (
                    <div className="cmd-item-ticket">
                      <div className="cmd-item-title">#{r.id} {r.title}</div>
                      <div className="cmd-item-meta">
                        <span className={`cmd-badge cmd-badge--${r.status}`}>{r.status}</span>
                        <span className={`cmd-badge cmd-badge--prio-${r.priority}`}>{r.priority}</span>
                      </div>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
        <div className="cmd-footer">
          <span><kbd>↑</kbd> <kbd>↓</kbd> gezin</span>
          <span><kbd>↵</kbd> seç</span>
          <span><kbd>ESC</kbd> kapat</span>
        </div>
      </div>
    </div>
  )
}
