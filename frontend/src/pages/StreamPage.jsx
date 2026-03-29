import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth.jsx'
import * as api from '../api.js'
import './StreamPage.css'

function formatDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' })
}

function priorityClass(p) {
  if (p === 'high') return 'stream-bar stream-bar--high'
  if (p === 'low') return 'stream-bar stream-bar--low'
  return 'stream-bar stream-bar--normal'
}

export default function StreamPage() {
  const { isSuper } = useAuth()
  const [filter, setFilter] = useState('all')
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setErr('')
    try {
      const data = await api.fetchTickets(filter)
      setTickets(data.tickets || [])
    } catch (e) {
      setErr(e.message)
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="stream mau-page">
      <header className="stream-hero">
        <div>
          <h1 className="stream-hero-title">Talep akışı</h1>
          <p className="stream-hero-lead">Tüm talepleriniz tek zaman çizelgesinde.</p>
        </div>
        <Link to="/app/yeni-talep" className="mau-btn mau-btn--primary stream-cta">
          Yeni talep
        </Link>
      </header>

      <div className="mau-toolbar stream-toolbar">
        <label className="stream-filter-label">
          Filtre
          <select
            className="stream-filter"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="all">Tümünü göster</option>
            <option value="open">Açık</option>
            <option value="assigned">Atanmış</option>
            <option value="closed">Kapatılmış</option>
          </select>
        </label>
        <button type="button" className="mau-btn mau-btn--ghost stream-refresh" onClick={load} disabled={loading}>
          {loading ? 'Yükleniyor…' : 'Yenile'}
        </button>
      </div>

      {err ? <p className="stream-error">{err}</p> : null}

      <section className="stream-section">
        <h2 className="stream-section-title">En son</h2>
        {loading ? <p className="stream-muted">Yükleniyor…</p> : null}
        {!loading && tickets.length === 0 ? (
          <div className="stream-empty mau-card">
            <p className="stream-empty-title">Henüz talep yok</p>
            <p className="stream-empty-text">Bu filtrede görüntülenecek kayıt bulunmuyor.</p>
            <Link to="/app/yeni-talep" className="mau-btn mau-btn--primary">
              İlk talebi oluştur
            </Link>
          </div>
        ) : null}
        <ul className="stream-list">
          {tickets.map((t) => (
            <li key={t.id} className="stream-item">
              <Link to={`/app/talep/${t.id}`} className="stream-link-wrapper" style={{ display: 'contents', color: 'inherit', textDecoration: 'none' }}>
                <div className="stream-date">{formatDate(t.created_at)}</div>
                <div className={`stream-body ${priorityClass(t.priority)}`}>
                  <div className="stream-item-head">
                    <strong className="stream-item-title">{t.title}</strong>
                    <span className="stream-badge stream-badge--status">{t.status}</span>
                  </div>
                  {isSuper ? (
                    <div className="stream-meta">
                      Açan: {t.owner_name}
                      {t.assignee_name ? ` · Atanan: ${t.assignee_name}` : ''}
                    </div>
                  ) : null}
                  <p className="stream-snippet">{t.description}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
