import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth.jsx'
import * as api from '../api.js'
import './TicketDetailPage.css'

export default function TicketDetailPage() {
  const { id } = useParams()
  const { isManager, isSupport, user } = useAuth()
  const navigate = useNavigate()
  
  const [ticket, setTicket] = useState(null)
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  
  const [staff, setStaff] = useState([])
  
  // States for actions
  const [assignees, setAssignees] = useState([])
  const [statusVal, setStatusVal] = useState('')
  const [historyActionVal, setHistoryActionVal] = useState('')
  const [actionLoading, setActionLoading] = useState(false)
  const [viewers, setViewers] = useState([])

  useEffect(() => {
    async function initPresence() {
      try {
        await api.pingTicketView(id)
        const vData = await api.fetchTicketViewers(id)
        if (Array.isArray(vData)) {
          setViewers(vData)
        }
      } catch(e) {}
    }
    
    initPresence()
    const intv = setInterval(initPresence, 10000)
    return () => clearInterval(intv)
  }, [id])

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true)
        const data = await api.fetchTicket(id)
        
        setTicket(data)
        setAssignees(data.assignees?.map(a => a.id) || [])
        setStatusVal(data.status || 'open')
        
        const hData = await api.fetchTicketHistory(id)
        setHistory(hData)
        
        // Fetch staff if manager
        if (isManager) {
          const sData = await api.fetchSupportStaff()
          if (sData && sData.staff) {
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
  }, [id, isManager])

  async function handleUpdate(updateBody) {
    if (!isManager && !isSupport) return
    setActionLoading(true)
    try {
      await api.patchTicket(id, updateBody)
      
      // Refresh ticket and history
      const tData = await api.fetchTicket(id)
      setTicket(tData)
      setAssignees(tData.assignees?.map(a => a.id) || [])
      setStatusVal(tData.status || 'open')
      
      const hData = await api.fetchTicketHistory(id)
      setHistory(hData)
    } catch (err) {
      alert('Güncelleme başarısız: ' + err.message)
    } finally {
      setActionLoading(false)
    }
  }

  async function handleCompletePart() {
    setActionLoading(true)
    try {
      await api.completeTicketPart(id)
      const tData = await api.fetchTicket(id)
      setTicket(tData)
      setAssignees(tData.assignees?.map(a => a.id) || [])
      
      const hData = await api.fetchTicketHistory(id)
      setHistory(hData)
      alert("Görev bölümünüz başarıyla tamamlandı olarak işaretlendi.")
    } catch(err) {
      alert("İşlem başarısız: " + err.message)
    } finally {
      setActionLoading(false)
    }
  }

  function handleStatusChange(e) {
    const val = e.target.value
    setStatusVal(val)
    handleUpdate({ status: val })
  }

  async function handleAddHistory(e) {
    e.preventDefault()
    if (!historyActionVal) return
    setActionLoading(true)
    try {
      await api.addTicketHistory(id, historyActionVal)
      const hData = await api.fetchTicketHistory(id)
      setHistory(hData)
      setHistoryActionVal('')
    } catch (err) {
      alert('Aşama eklenemedi: ' + err.message)
    } finally {
      setActionLoading(false)
    }
  }

  async function handleRequestClose() {
    setActionLoading(true)
    try {
      await api.requestTicketClose(id)
      const tData = await api.fetchTicket(id)
      setTicket(tData)
      setAssignees(tData.assignees?.map(a => a.id) || [])
      setStatusVal(tData.status || 'open')
      
      const hData = await api.fetchTicketHistory(id)
      setHistory(hData)
      alert("Çözüm onay talebi yöneticilere iletildi.")
    } catch(err) {
      alert("İşlem başarısız: " + err.message)
    } finally {
      setActionLoading(false)
    }
  }

  async function handleBackupRequest() {
    if (!window.confirm("Bu bilette diğer meslektaşlarınızdan yardım çağrısı başlatmak istediğinize emin misiniz?")) return;
    setActionLoading(true)
    try {
      await api.requestTicketBackup(id)
      alert("Yardım çağrınız tüm personele ve yöneticilere ulaştırıldı.")
    } catch(err) {
      alert("Çağrı başarısız: " + err.message)
    } finally {
      setActionLoading(false)
    }
  }

  async function handleRate(stars) {
    if (!window.confirm(`Hizmetimize ${stars} yıldız vermek istiyor musunuz?`)) return;
    setActionLoading(true)
    try {
      await api.patchTicket(id, { rating: stars })
      const tData = await api.fetchTicket(id)
      setTicket(tData)
      alert("Geri bildiriminiz için teşekkürler!")
    } catch(err) {
      alert("Puanlama başarısız: " + err.message)
    } finally {
      setActionLoading(false)
    }
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
          {viewers.length > 0 && (
            <div style={{background: 'var(--brand-info)', color: '#fff', padding: '12px 20px', fontSize: '0.9rem', marginBottom: '1rem', borderRadius: '6px', border: '1px solid var(--brand-info)'}}>
              👁️ <strong>Şu anda bu bileti {viewers.join(', ')} de inceliyor.</strong> Lütfen çakışmalara dikkat ediniz.
            </div>
          )}
          <div className="td-card main-card">
            <div className="td-header">
              <h1 className="td-title">{ticket.title}</h1>
              <div className="td-meta">
                <span className="td-pill" style={{ borderColor: pColor, color: pColor, backgroundColor: pColor + '1A' }}>
                  {ticket.priority.toUpperCase()}
                </span>
                <span className="td-pill td-status-pill" data-status={ticket.status}>
                  {ticket.status === 'pending_close' ? 'ONAY BEKLİYOR' : ticket.status.toUpperCase()}
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
              
              {ticket.photo_path && (
                <div className="td-photo-box">
                  <h3>Eklenen Fotoğraf</h3>
                  <a href={ticket.photo_path.startsWith('http') ? ticket.photo_path : 'http://127.0.0.1:8080' + ticket.photo_path} target="_blank" rel="noopener noreferrer">
                    <img 
                      src={ticket.photo_path.startsWith('http') ? ticket.photo_path : 'http://127.0.0.1:8080' + ticket.photo_path} 
                      alt="Talep Fotoğrafı" 
                      style={{maxWidth: '100%', borderRadius: '8px', border: '1px solid #eee', marginTop: '10px', cursor: 'zoom-in'}} 
                    />
                  </a>
                </div>
              )}

              <div className="td-history-box" style={{marginTop: '2rem'}}>
                <h3>Süreç Takibi</h3>
                <ul className="td-timeline" style={{listStyle: 'none', padding: 0, marginTop: '1rem'}}>
                  {history.map(h => (
                    <li key={h.id} style={{padding: '0.8rem', borderLeft: '3px solid var(--brand-blue)', marginBottom: '0.5rem', background: 'var(--mau-page-bg)', borderRadius: '0 4px 4px 0'}}>
                      <div style={{fontSize: '0.85rem', color: 'var(--mau-text-muted)', marginBottom: '0.2rem'}}>
                        {new Date(h.created_at).toLocaleString('tr-TR')} - <strong>{h.user_name}</strong>
                      </div>
                      <div style={{fontWeight: '500', color: 'var(--mau-text)'}}>
                        {h.action}
                      </div>
                    </li>
                  ))}
                </ul>
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
                <strong>Atanan Kişiler:</strong> 
                {ticket.assignees && ticket.assignees.length > 0 ? (
                  <ul style={{ paddingLeft: '20px', marginTop: '4px', marginBottom: '0' }}>
                    {ticket.assignees.map(a => (
                      <li key={a.id} style={{ color: a.is_completed ? 'var(--brand-success)' : 'inherit' }}>
                        {a.name} {a.is_completed ? '✓ (Tamamlandı)' : '(Bekliyor)'}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span className="unassigned">Atanmadı</span>
                )}
              </li>
              <li>
                <strong>Son Güncelleme:</strong> {new Date(ticket.updated_at).toLocaleString('tr-TR')}
              </li>
              {ticket.resolved_at && (
                <li>
                  <strong>Çözüm Tarihi:</strong> {new Date(ticket.resolved_at).toLocaleString('tr-TR')}
                </li>
              )}
            </ul>
          </div>

          {ticket.status === 'closed' && (
            <div className="td-card info-card mt-4" style={{marginTop: '1rem'}}>
              <h3 style={{color: 'var(--mau-text)'}}>Hizmet Değerlendirmesi</h3>
              {ticket.rating ? (
                <div style={{fontSize: '1.2rem', color: '#eab308'}}>
                  {'★'.repeat(ticket.rating)}{'☆'.repeat(5 - ticket.rating)} ({ticket.rating}/5)
                </div>
              ) : (
                ticket.user_id === user?.id ? (
                  <div>
                    <p style={{fontSize: '0.9rem', color: '#475569', marginBottom: '8px'}}>Bu destek hizmetini nasıl puanlarsınız?</p>
                    <div style={{display: 'flex', gap: '4px'}}>
                      {[1, 2, 3, 4, 5].map(star => (
                        <button 
                          key={star} 
                          onClick={() => handleRate(star)}
                          disabled={actionLoading}
                          style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            fontSize: '1.5rem', color: '#cbd5e1', transition: 'color 0.2s',
                          }}
                          onMouseOver={(e) => {
                             const btns = e.currentTarget.parentElement.children;
                             for (let i = 0; i < star; i++) btns[i].style.color = '#eab308';
                          }}
                          onMouseOut={(e) => {
                             const btns = e.currentTarget.parentElement.children;
                             for (let i = 0; i < 5; i++) btns[i].style.color = '#cbd5e1';
                          }}
                        >★</button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div style={{fontSize: '0.9rem', color: 'var(--mau-text-muted)'}}>Henüz puanlanmadı.</div>
                )
              )}
            </div>
          )}

          {(isManager || isSupport) && (
            <div className="td-card action-card">
              <h3>Yönetim İşlemleri</h3>
              
              {isManager && (
                <div className="td-action-group">
                  <label>Personel Ata</label>
                  <div style={{ maxHeight: '150px', overflowY: 'auto', background: 'var(--mau-page-bg)', padding: '10px', borderRadius: '4px', border: '1px solid var(--mau-border-subtle)' }}>
                    {staff.map(s => (
                      <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', cursor: 'pointer' }}>
                        <input 
                          type="checkbox"
                          checked={assignees.includes(s.id)}
                          onChange={(e) => {
                             const newAssignees = e.target.checked 
                               ? [...assignees, s.id] 
                               : assignees.filter(id => id !== s.id);
                             setAssignees(newAssignees);
                             handleUpdate({ assignees: newAssignees });
                          }}
                          disabled={actionLoading}
                        />
                        <span>{s.display_name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

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
                    {isManager && <option value="closed">Çözüldü / Kapalı (Closed)</option>}
                    {ticket.status === 'pending_close' && <option value="pending_close" disabled>Onay Bekliyor (Pending)</option>}
                  </select>
                </div>
              </div>

              {/* Check if current user is assigned and has not completed */}
              {ticket.assignees?.some(a => a.id === user?.id && !a.is_completed) && ticket.status !== 'closed' && (
                <div className="td-action-group" style={{marginTop: '1.5rem'}}>
                  <button 
                    onClick={handleCompletePart}
                    disabled={actionLoading}
                    style={{width: '100%', padding: '10px', background: 'var(--brand-primary)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: '500'}}
                  >
                    ✅ Kendi Kısmımı Tamamladım
                  </button>
                </div>
              )}

              {isSupport && !isManager && ticket.status !== 'closed' && ticket.status !== 'pending_close' && (
                <div className="td-action-group" style={{marginTop: '1rem'}}>
                  <button 
                    onClick={handleRequestClose}
                    disabled={actionLoading}
                    style={{width: '100%', padding: '10px', background: 'var(--brand-success)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: '500'}}
                  >
                    Çözüldü - Yönetici Onayına Sun
                  </button>
                </div>
              )}

              <div className="td-action-group" style={{marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid #eee'}}>
                <label>Sürece Aşama Ekle</label>
                <div style={{display: 'flex', gap: '8px', marginTop: '8px'}}>
                  <div className="td-select-wrap" style={{flex: 1}}>
                    <select 
                      value={historyActionVal} 
                      onChange={(e) => setHistoryActionVal(e.target.value)}
                      disabled={actionLoading}
                    >
                      <option value="">-- Aşama Seç --</option>
                      <option value="Gerekli birimler uyarıldı">Gerekli birimler uyarıldı</option>
                      <option value="İşlem için görevli yönlendirildi">İşlem için görevli yönlendirildi</option>
                      <option value="Donanım / Parça bekleniyor">Donanım / Parça bekleniyor</option>
                      <option value="Detaylı inceleme devam ediyor">Detaylı inceleme devam ediyor</option>
                      <option value="Kullanıcıdan ek bilgi bekleniyor">Kullanıcıdan ek bilgi bekleniyor</option>
                    </select>
                  </div>
                  <button 
                    onClick={handleAddHistory}
                    disabled={!historyActionVal || actionLoading} 
                    style={{padding: '0 12px', background: 'var(--brand-primary)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: '500'}}
                  >
                    Ekle
                  </button>
                </div>
              </div>

              {(isSupport || isManager) && (
                <div className="td-action-group" style={{marginTop: '0.8rem'}}>
                  <button 
                    onClick={handleBackupRequest}
                    disabled={actionLoading}
                    style={{width: '100%', padding: '10px', background: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: '500'}}
                  >
                    🚨 Ekip / Yardım Çağır
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
