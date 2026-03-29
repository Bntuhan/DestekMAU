import { useCallback, useEffect, useState } from 'react'
import * as api from '../api.js'
import './AssignPage.css'

export default function AssignPage() {
  const [tickets, setTickets] = useState([])
  const [staff, setStaff] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [assigning, setAssigning] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setErr('')
    try {
      const [tData, sData] = await Promise.all([
        api.fetchTickets('all'),
        api.fetchSupportStaff(),
      ])
      setTickets(tData.tickets || [])
      setStaff(sData.staff || [])
    } catch (e) {
      setErr(e.message || 'Liste yüklenemedi')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function assign(ticketId, assigneeId) {
    setAssigning(ticketId)
    setErr('')
    try {
      const body =
        assigneeId === '' ? { assignee_id: null } : { assignee_id: Number(assigneeId) }
      await api.patchTicket(ticketId, body)
      await load()
    } catch (e) {
      setErr(e.message || 'Atama başarısız')
    } finally {
      setAssigning(null)
    }
  }

  async function setStatus(ticketId, status) {
    setAssigning(ticketId)
    setErr('')
    try {
      await api.patchTicket(ticketId, { status })
      await load()
    } catch (e) {
      setErr(e.message || 'Durum güncellenemedi')
    } finally {
      setAssigning(null)
    }
  }

  return (
    <div className="assign mau-page">
      <header className="assign-hero">
        <div>
          <h1 className="assign-hero-title">Talep atama</h1>
          <p className="assign-hero-lead">Durum ve sorumlu personel atamasını buradan yönetin.</p>
        </div>
        <button type="button" className="mau-btn mau-btn--ghost assign-refresh" onClick={load} disabled={loading}>
          {loading ? 'Yükleniyor…' : 'Yenile'}
        </button>
      </header>
      {err ? <p className="assign-error">{err}</p> : null}
      <div className="assign-table-wrap mau-card">
        <table className="assign-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Başlık</th>
              <th>Açan</th>
              <th>Durum</th>
              <th>Atanan</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {tickets.length === 0 && !loading ? (
              <tr>
                <td colSpan={6} className="assign-empty-cell">
                  Kayıtlı talep yok.
                </td>
              </tr>
            ) : null}
            {tickets.map((t) => (
              <tr key={t.id} className={assigning === t.id ? 'assign-row-busy' : ''}>
                <td className="assign-id">{t.id}</td>
                <td className="assign-cell-title" title={t.title}>
                  {t.title}
                </td>
                <td>{t.owner_name}</td>
                <td>
                  <select
                    className="assign-select"
                    value={t.status}
                    disabled={assigning === t.id}
                    onChange={(e) => setStatus(t.id, e.target.value)}
                  >
                    <option value="open">Açık</option>
                    <option value="assigned">Atanmış</option>
                    <option value="closed">Kapatılmış</option>
                  </select>
                </td>
                <td>
                  <select
                    className="assign-select"
                    value={t.assignee_id ?? ''}
                    disabled={assigning === t.id}
                    onChange={(e) => assign(t.id, e.target.value)}
                  >
                    <option value="">— Atanmadı —</option>
                    {staff.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.display_name}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="assign-actions">{assigning === t.id ? '…' : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
