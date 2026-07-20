import { useCallback, useEffect, useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth.jsx'
import * as api from '../api.js'
import { SkeletonList } from '../components/Skeleton.jsx'
import './StreamPage.css'

const PAGE_SIZE = 10

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

function priorityLabel(p) {
  if (p === 'high') return 'Yüksek'
  if (p === 'low') return 'Düşük'
  return 'Normal'
}

function statusLabel(s) {
  if (s === 'open') return 'Açık'
  if (s === 'assigned') return 'Atandı'
  if (s === 'closed') return 'Kapatıldı'
  if (s === 'pending_close') return 'Onay Bekliyor'
  return s
}

function ticketAge(created_at) {
  if (!created_at) return null
  const diff = (Date.now() - new Date(created_at).getTime()) / (1000 * 60 * 60 * 24)
  return Math.floor(diff)
}

function ageClass(ticket) {
  if (ticket.status === 'closed') return ''
  const days = ticketAge(ticket.created_at)
  if (days >= 3) return 'stream-item--age-critical'
  if (days >= 1) return 'stream-item--age-warn'
  return ''
}

function exportToCSV(tickets) {
  const headers = ['ID', 'Başlık', 'Durum', 'Öncelik', 'Açan', 'Tarih'];
  const rows = tickets.map(t => [
    t.id,
    `"${(t.title || '').replace(/"/g, '""')}"`,
    statusLabel(t.status),
    priorityLabel(t.priority),
    `"${(t.owner_name || '').replace(/"/g, '""')}"`,
    formatDate(t.created_at)
  ]);
  
  const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', 'talepler.csv');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export default function StreamPage() {
  const { isSuper, isSupport } = useAuth()
  const [filter, setFilter] = useState('all')
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  // Arama & Sayfalama
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  const load = useCallback(async () => {
    setLoading(true)
    setErr('')
    setPage(1) // filtre değişince ilk sayfaya dön
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

  // Arama filtresi (client-side)
  const filtered = useMemo(() => {
    if (!search.trim()) return tickets
    const q = search.trim().toLowerCase()
    return tickets.filter(t =>
      t.title?.toLowerCase().includes(q) ||
      t.description?.toLowerCase().includes(q) ||
      t.owner_name?.toLowerCase().includes(q)
    )
  }, [tickets, search])

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  // Arama değişince sayfayı sıfırla
  useEffect(() => {
    setPage(1)
  }, [search])

  function handleSearchChange(e) {
    setSearch(e.target.value)
  }

  function clearSearch() {
    setSearch('')
  }

  return (
    <div className="stream mau-page">
      <header className="stream-hero">
        <div className="stream-hero-content">
          <div className="stream-hero-text">
            <h1 className="stream-hero-title">Talep akışı</h1>
            <p className="stream-hero-lead">Tüm talepleriniz tek zaman çizelgesinde.</p>
          </div>
          {!isSupport && (
            <Link to="/app/yeni-talep" className="mau-btn mau-btn--primary stream-cta">
              + Yeni talep
            </Link>
          )}
        </div>
        <img src="/maltepe-logo.png" alt="Üniversite Logosu" className="stream-hero-logo" aria-hidden />
      </header>

      {/* Araç Çubuğu */}
      <div className="stream-toolbar mau-toolbar">
        {/* Arama */}
        <div className="stream-search-wrap">
          <svg className="stream-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <circle cx="11" cy="11" r="8" />
            <path strokeLinecap="round" d="M21 21l-4.35-4.35" />
          </svg>
          <input
            id="stream-search"
            type="search"
            className="stream-search"
            placeholder="Başlık, açıklama veya kişi ara…"
            value={search}
            onChange={handleSearchChange}
            aria-label="Taleplerde ara"
          />
          {search && (
            <button className="stream-search-clear" onClick={clearSearch} aria-label="Aramayı temizle">
              ✕
            </button>
          )}
        </div>

        {/* Filtre */}
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

        <button type="button" className="mau-btn mau-btn--ghost stream-refresh" onClick={() => exportToCSV(tickets)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16" style={{marginRight: '6px', verticalAlign: 'text-bottom'}}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Dışa Aktar
        </button>

        <button type="button" className="mau-btn mau-btn--ghost stream-refresh" onClick={load} disabled={loading}>
          {loading ? 'Yükleniyor…' : 'Yenile'}
        </button>
      </div>

      {err ? <p className="stream-error">{err}</p> : null}

      {/* Sonuç Sayısı */}
      {!loading && (
        <div className="stream-results-info">
          {search
            ? <span><strong>{filtered.length}</strong> sonuç bulundu{filtered.length !== tickets.length ? ` (toplam ${tickets.length} talep içinden)` : ''}</span>
            : <span>Toplam <strong>{tickets.length}</strong> talep</span>
          }
        </div>
      )}

      <section className="stream-section">
        <h2 className="stream-section-title">En son</h2>

        {loading ? <SkeletonList count={5} /> : null}

        {!loading && filtered.length === 0 ? (
          <div className="stream-empty mau-card">
            {search ? (
              <>
                <p className="stream-empty-title">Sonuç bulunamadı</p>
                <p className="stream-empty-text">«{search}» aramasıyla eşleşen talep yok. Farklı bir kelime deneyin.</p>
                <button type="button" className="mau-btn mau-btn--ghost" onClick={clearSearch}>Aramayı temizle</button>
              </>
            ) : (
              <>
                <p className="stream-empty-title">Henüz talep yok</p>
                <p className="stream-empty-text">Bu filtrede görüntülenecek kayıt bulunmuyor.</p>
                {!isSupport && (
                  <Link to="/app/yeni-talep" className="mau-btn mau-btn--primary">
                    İlk talebi oluştur
                  </Link>
                )}
              </>
            )}
          </div>
        ) : null}

        <ul className="stream-list">
          {paginated.map((t) => (
            <li key={t.id} className="stream-item">
              <Link to={`/app/talep/${t.id}`} className="stream-link-wrapper" style={{ display: 'contents', color: 'inherit', textDecoration: 'none' }}>
                <div className="stream-date">{formatDate(t.created_at)}</div>
                <div
                  className={`stream-body ${priorityClass(t.priority)} ${ageClass(t)}`}
                  title={t.status !== 'closed' && ticketAge(t.created_at) > 0 ? `${ticketAge(t.created_at)} gündür açık` : ''}
                >
                  <div className="stream-item-head">
                    <strong className="stream-item-title">{t.title}</strong>
                    <div className="stream-badges">
                      <span className={`stream-badge stream-badge--status stream-badge--${t.status}`}>
                        {statusLabel(t.status)}
                      </span>
                      <span className={`stream-badge stream-badge--prio-${t.priority}`}>
                        {t.priority === 'high' ? 'Yüksek' : t.priority === 'low' ? 'Düşük' : 'Normal'}
                      </span>
                      {(() => {
                        if (t.status === 'closed' || t.status === 'pending_close') return null
                        const hours = t.priority === 'high' ? 24 : t.priority === 'normal' ? 48 : 72
                        const target = new Date(new Date(t.created_at).getTime() + hours * 60 * 60 * 1000)
                        if (new Date() > target) {
                          return <span className="stream-badge" style={{background: '#ef4444', color: '#fff', border: 'none'}}>SLA Aşıldı</span>
                        }
                        return null
                      })()}
                    </div>
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

        {/* Pagination */}
        {!loading && totalPages > 1 && (
          <nav className="stream-pagination" aria-label="Sayfa gezinme">
            <button
              className="stream-page-btn"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              aria-label="Önceki sayfa"
            >
              ←
            </button>

            {Array.from({ length: totalPages }, (_, i) => i + 1).map(n => {
              // Çok fazla sayfa varsa ortada "..." göster
              if (totalPages > 7 && n !== 1 && n !== totalPages && Math.abs(n - page) > 2) {
                if (n === 2 || n === totalPages - 1) return <span key={n} className="stream-page-ellipsis">…</span>
                return null
              }
              return (
                <button
                  key={n}
                  className={`stream-page-btn${n === page ? ' stream-page-btn--active' : ''}`}
                  onClick={() => setPage(n)}
                  aria-label={`Sayfa ${n}`}
                  aria-current={n === page ? 'page' : undefined}
                >
                  {n}
                </button>
              )
            })}

            <button
              className="stream-page-btn"
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              aria-label="Sonraki sayfa"
            >
              →
            </button>

            <span className="stream-page-info">{page} / {totalPages}</span>
          </nav>
        )}
      </section>
    </div>
  )
}
