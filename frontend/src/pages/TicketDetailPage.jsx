import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth.jsx'
import './TicketDetailPage.css'

export default function TicketDetailPage() {
  const { id } = useParams()
  const { token, isSuper } = useAuth()
  const navigate = useNavigate()
  
  const [ticket, setTicket] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  
  const [staff, setStaff] = useState([])
  
  // States for actions
  const [assigneeId, setAssigneeId] = useState('')
  const [statusVal, setStatusVal] = useState('')
  const [actionLoading, setActionLoading] = useState(false)

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true)
        const res = await fetch(`http://127.0.0.1:8080/api/tickets/${id}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Failed to fetch ticket')
        
        setTicket(data)
        setAssigneeId(data.assignee_id || '')
        setStatusVal(data.status || 'open')
        
        // Fetch staff if superuser
        if (isSuper) {
          const sRes = await fetch('http://127.0.0.1:8080/api/support-staff', {
            headers: { 'Authorization': `Bearer ${token}` }
          })
          const sData = await sRes.json()
          if (sRes.ok && sData.staff) {
            setStaff(sData.staff)
          }
        }
      } catch (err) {
        setError('Talep yüklenirken hata oluştu: ' + err.message)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [id, token, isSuper])

  async function handleUpdate(updateBody) {
    if (!isSuper) return
    setActionLoading(true)
    try {
      const res = await fetch(`http://127.0.0.1:8080/api/tickets/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(updateBody)
      })
      if (!res.ok) throw new Error('Güncelleme başarısız')
      
      // Refresh ticket
      const tRes = await fetch(`http://127.0.0.1:8080/api/tickets/${id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const tData = await tRes.json()
      if (tRes.ok) {
        setTicket(tData)
        setAssigneeId(tData.assignee_id || '')
        setStatusVal(tData.status || 'open')
      }
    } catch (err) {
      alert(err.message)
    } finally {
      setActionLoading(false)
    }
  }

  function handleAssignChange(e) {
    const val = e.target.value
    setAssigneeId(val)
    handleUpdate({ assignee_id: val ? Number(val) : null })
  }

  function handleStatusChange(e) {
    const val = e.target.value
    setStatusVal(val)
    handleUpdate({ status: val })
  }

  function goBack() {
    navigate('/app')
  }

  if (loading) return <div className="td-page loading">Talep yükleniyor...</div>
  if (error) return <div className="td-page error">{error}</div>
  if (!ticket) return <div className="td-page error">Talep bulunamadı.</div>

  const pColor = ticket.priority === 'high' ? 'var(--brand-danger)' : ticket.priority === 'low' ? 'var(--brand-info)' : 'var(--brand-warning)'

  return (
    <div className="td-page fade-in">
      <button className="td-back-btn" onClick={goBack}>
        ← Geri Dön
      </button>

      <div className="td-grid">
        <div className="td-main">
          <div className="td-card main-card">
            <div className="td-header">
              <h1 className="td-title">{ticket.title}</h1>
              <div className="td-meta">
                <span className="td-pill" style={{ borderColor: pColor, color: pColor, backgroundColor: pColor + '1A' }}>
                  {ticket.priority.toUpperCase()}
                </span>
                <span className="td-pill td-status-pill" data-status={ticket.status}>
                  {ticket.status.toUpperCase()}
                </span>
                <span className="td-date">Oluşturulma: {new Date(ticket.created_at).toLocaleString('tr-TR')}</span>
              </div>
            </div>
            
            <div className="td-body">
              <h3>Talep Açıklaması</h3>
              <div className="td-desc-box">
                {ticket.description.split('\n').map((line, idx) => (
                  <p key={idx}>{line}</p>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="td-side">
          <div className="td-card info-card">
            <h3>Talep Bilgileri</h3>
            <ul className="td-info-list">
              <li>
                <strong>ID:</strong> #{ticket.id}
              </li>
              <li>
                <strong>Oluşturan:</strong> {ticket.owner_name}
              </li>
              <li>
                <strong>Atanan Kişi:</strong> {ticket.assignee_name || <span className="unassigned">Atanmadı</span>}
              </li>
              <li>
                <strong>Son Güncelleme:</strong> {new Date(ticket.updated_at).toLocaleString('tr-TR')}
              </li>
            </ul>
          </div>

          {isSuper && (
            <div className="td-card action-card">
              <h3>Yönetim İşlemleri</h3>
              
              <div className="td-action-group">
                <label>Personel Ata</label>
                <div className="td-select-wrap">
                  <select 
                    value={assigneeId} 
                    onChange={handleAssignChange}
                    disabled={actionLoading}
                  >
                    <option value="">-- Kimseye Atanmadı --</option>
                    {staff.map(s => (
                      <option key={s.id} value={s.id}>{s.display_name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="td-action-group">
                <label>Durumu Güncelle</label>
                <div className="td-select-wrap">
                  <select 
                    value={statusVal} 
                    onChange={handleStatusChange}
                    disabled={actionLoading}
                  >
                    <option value="open">Açık (Open)</option>
                    <option value="assigned">Atandı (Assigned)</option>
                    <option value="closed">Çözüldü / Kapalı (Closed)</option>
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
