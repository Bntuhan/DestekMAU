/* eslint-disable */
import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth.jsx'
import * as api from '../api.js'
import Modal from '../components/Modal.jsx'
import CannedResponses from '../components/CannedResponses.jsx'
import Lightbox from '../components/Lightbox.jsx'
import Timeline from '../components/Timeline.jsx'
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
  const [assigneesSaving, setAssigneesSaving] = useState(false)
  const [assigneesError, setAssigneesError] = useState('')
  const [viewers, setViewers] = useState([])
  const assigneesSaveTimer = useRef(null)
  const assigneesPending = useRef(null)

  // Yorum sistemi
  const [comments, setComments] = useState([])
  const [commentText, setCommentText] = useState('')
  const [isInternal, setIsInternal] = useState(false)
  const [commentLoading, setCommentLoading] = useState(false)
  const commentsEndRef = useRef(null)

  // Modal state
  const [modal, setModal] = useState({ open: false, type: 'alert', title: '', message: '', onConfirm: null, onCancel: null, confirmLabel: '' })
  const [lightboxOpen, setLightboxOpen] = useState(false)

  function showAlert(title, message, onConfirm) {
    setModal({ open: true, type: 'alert', title, message, onConfirm: () => { setModal(m => ({ ...m, open: false })); onConfirm?.() }, onCancel: null, confirmLabel: 'Tamam' })
  }

  function showConfirm(title, message, onConfirm, type = 'confirm', confirmLabel = '') {
    setModal({
      open: true,
      type,
      title,
      message,
      confirmLabel,
      onConfirm: () => { setModal(m => ({ ...m, open: false })); onConfirm() },
      onCancel: () => setModal(m => ({ ...m, open: false })),
    })
  }

  function normalizeAssigneeIds(list) {
    return [...new Set((list || []).map((id) => Number(id)).filter((id) => !Number.isNaN(id)))]
  }

  const flushAssigneesSave = useCallback(async () => {
    const ids = assigneesPending.current
    if (ids == null) return
    assigneesPending.current = null
    setAssigneesSaving(true)
    setAssigneesError('')
    try {
      await api.patchTicket(id, { assignees: ids })
      const tData = await api.fetchTicket(id)
      setTicket(tData)
      setAssignees(normalizeAssigneeIds(tData.assignees?.map((a) => a.id)))
      setStatusVal(tData.status || 'open')
      const hData = await api.fetchTicketHistory(id)
      setHistory(hData)
    } catch (err) {
      setAssigneesError(err.message || 'Kayıt başarısız')
      try {
        const tData = await api.fetchTicket(id)
        setAssignees(normalizeAssigneeIds(tData.assignees?.map((a) => a.id)))
      } catch {
        /* ignore */
      }
    } finally {
      setAssigneesSaving(false)
    }
  }, [id])

  const scheduleAssigneesSave = useCallback((ids) => {
    assigneesPending.current = ids
    if (assigneesSaveTimer.current) clearTimeout(assigneesSaveTimer.current)
    assigneesSaveTimer.current = setTimeout(() => {
      assigneesSaveTimer.current = null
      flushAssigneesSave()
    }, 400)
  }, [flushAssigneesSave])

  useEffect(() => {
    return () => {
      if (assigneesSaveTimer.current) clearTimeout(assigneesSaveTimer.current)
    }
  }, [])

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
        setAssignees(normalizeAssigneeIds(data.assignees?.map((a) => a.id)))
        setStatusVal(data.status || 'open')
        
        const hData = await api.fetchTicketHistory(id)
        setHistory(hData)

        // Yorumları yükle
        const cData = await api.fetchComments(id)
        if (Array.isArray(cData)) setComments(cData)
        
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
      setAssignees(normalizeAssigneeIds(tData.assignees?.map((a) => a.id)))
      setStatusVal(tData.status || 'open')
      
      const hData = await api.fetchTicketHistory(id)
      setHistory(hData)
    } catch (err) {
      if (err.data?.error === 'assignees_incomplete') {
        const c = err.data.completed ?? '?'
        const t = err.data.total ?? '?'
        showAlert('İşlem Tamamlanamadı', `Tüm atanan personel tamamlamadan talep kapatılamaz (${c}/${t}).`)
      } else {
        showAlert('Güncelleme Başarısız', err.message)
      }
      setStatusVal(ticket?.status || 'open')
    } finally {
      setActionLoading(false)
    }
  }

  function handleAssigneeToggle(staffId) {
    const sid = Number(staffId)
    setAssigneesError('')
    setAssignees((prev) => {
      const normalized = normalizeAssigneeIds(prev)
      const next = normalized.includes(sid)
        ? normalized.filter((x) => x !== sid)
        : [...new Set([...normalized, sid])]
      scheduleAssigneesSave(next)
      return next
    })
  }

  async function handleCompletePart() {
    setActionLoading(true)
    try {
      await api.completeTicketPart(id)
      const tData = await api.fetchTicket(id)
      setTicket(tData)
      setAssignees(normalizeAssigneeIds(tData.assignees?.map((a) => a.id)))
      setStatusVal(tData.status || 'open')
      const hData = await api.fetchTicketHistory(id)
      setHistory(hData)
      const list = tData.assignees || []
      const allDone = list.length > 0 && list.every((a) => a.is_completed)
      if (tData.status === 'pending_close' && allDone) {
        showAlert('Görev Tamamlandı', 'Göreviniz tamamlandı. Tüm personel bitirdi — talep yönetici onayına gönderildi.')
      } else {
        showAlert('Tamamlandı', 'Görev bölümünüz tamamlandı olarak işaretlendi.')
      }
    } catch(err) {
      showAlert('Hata', 'İşlem başarısız: ' + err.message)
    } finally {
      setActionLoading(false)
    }
  }

  function handleStatusChange(e) {
    const val = e.target.value
    const list = ticket?.assignees || []
    const total = list.length
    const completed = list.filter((a) => a.is_completed).length
    if (val === 'closed' && isManager && total > 0 && completed < total) {
      showAlert('Kapatılamaz', `Tüm atanan personel tamamlamadan talep kapatılamaz (${completed}/${total}).`)
      setStatusVal(ticket.status)
      return
    }
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
      showAlert('Hata', 'Aşama eklenemedi: ' + err.message)
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
      setAssignees(normalizeAssigneeIds(tData.assignees?.map((a) => a.id)))
      setStatusVal(tData.status || 'open')
      
      const hData = await api.fetchTicketHistory(id)
      setHistory(hData)
      showAlert('İstek Gönderildi', 'Çözüm onay talebi yöneticilere iletildi.')
    } catch(err) {
      showAlert('Hata', 'İşlem başarısız: ' + err.message)
    } finally {
      setActionLoading(false)
    }
  }

  function handleBackupRequest() {
    showConfirm(
      'Yardım Çağır',
      'Bu bilette diğer meslektaşlarınızdan yardım çağrısı başlatmak istediğinize emin misiniz?',
      async () => {
        setActionLoading(true)
        try {
          await api.requestTicketBackup(id)
          showAlert('Çağrı Gönderildi', 'Yardım çağrınız tüm personele ve yöneticilere ulaştırıldı.')
        } catch(err) {
          showAlert('Hata', 'Çağrı başarısız: ' + err.message)
        } finally {
          setActionLoading(false)
        }
      },
      'danger',
      'Evet, çağır'
    )
  }

  function handleRate(stars) {
    showConfirm(
      'Hizmet Değerlendirmesi',
      `Hizmetimize ${stars} yıldız vermek istiyor musunuz?`,
      async () => {
        setActionLoading(true)
        try {
          await api.patchTicket(id, { rating: stars })
          const tData = await api.fetchTicket(id)
          setTicket(tData)
          showAlert('Teşekkürler!', 'Geri bildiriminiz kaydedildi.')
        } catch(err) {
          showAlert('Hata', 'Puanlama başarısız: ' + err.message)
        } finally {
          setActionLoading(false)
        }
      },
      'confirm',
      `${stars} Yıldız Ver`
    )
  }

  function goBack() {
    navigate('/app')
  }

  if (loading) return <div className="td-page loading">Talep yükleniyor...</div>
  if (error) return <div className="td-page error">{error}</div>
  if (!ticket) return <div className="td-page error">Talep bulunamadı.</div>

  const pColor = ticket.priority === 'high' ? 'var(--brand-danger)' : ticket.priority === 'low' ? 'var(--brand-info)' : 'var(--brand-warning)'

  const assigneeList = ticket.assignees || []
  const assigneeTotal = assigneeList.length
  const assigneeCompleted = assigneeList.filter((a) => a.is_completed).length
  const allAssigneesComplete = assigneeTotal > 0 && assigneeCompleted === assigneeTotal
  const canManagerClose = assigneeTotal === 0 || allAssigneesComplete

  return (
    <div className="td-page fade-in">
      {/* Modal bileşeni */}
      <Modal
        open={modal.open}
        type={modal.type}
        title={modal.title}
        message={modal.message}
        confirmLabel={modal.confirmLabel}
        onConfirm={modal.onConfirm}
        onCancel={modal.onCancel}
      />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <button className="td-back-btn" style={{ marginBottom: 0 }} onClick={goBack}>
          ← Geri Dön
        </button>
        <button className="mau-btn mau-btn--ghost td-print-btn" onClick={() => window.print()}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: '6px'}}>
            <polyline points="6 9 6 2 18 2 18 9"></polyline>
            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
            <rect x="6" y="14" width="12" height="8"></rect>
          </svg>
          Yazdır / PDF
        </button>
      </div>

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
                  <div onClick={() => setLightboxOpen(true)} style={{cursor: 'zoom-in', display: 'inline-block'}}>
                    <img 
                      src={ticket.photo_path.startsWith('http') ? ticket.photo_path : ticket.photo_path} 
                      alt="Talep Fotoğrafı" 
                      style={{maxWidth: '100%', borderRadius: '8px', border: '1px solid #eee', marginTop: '10px'}} 
                    />
                  </div>
                  <Lightbox 
                    open={lightboxOpen} 
                    src={ticket.photo_path.startsWith('http') ? ticket.photo_path : ticket.photo_path} 
                    onClose={() => setLightboxOpen(false)} 
                  />
                </div>
              )}

              <div className="td-history-box" style={{marginTop: '2rem'}}>
                <h3>Süreç Takibi</h3>
                <Timeline items={history} />
              </div>
            </div>

            {/* ── Yorum Sistemi ── */}
            <div className="td-comments-box">
              <h3 className="td-comments-title">Mesajlar & Yorumlar</h3>
              <div className="td-comments-list">
                {comments.length === 0 ? (
                  <p className="td-comments-empty">Henüz yorum yok. İlk mesajı sen gönder!</p>
                ) : (
                  comments.map(c => {
                    const isInternal = c.is_internal === 1
                    return (
                      <div key={c.id} className={`td-comment${c.user_id === user?.id ? ' td-comment--own' : ''}${isInternal ? ' td-comment--internal' : ''}`}>
                        <div className="td-comment__meta">
                          <span className="td-comment__author">
                            {c.display_name} {isInternal && <span style={{fontSize: '0.75rem', background: '#f59e0b', color: '#fff', padding: '2px 6px', borderRadius: '4px', marginLeft: '6px'}}>Dahili Not</span>}
                          </span>
                          <span className="td-comment__date">{new Date(c.created_at).toLocaleString('tr-TR')}</span>
                        </div>
                        <div className="td-comment__body">{c.body}</div>
                      </div>
                    )
                  })
                )}
                <div ref={commentsEndRef} />
              </div>
              <form className="td-comment-form" onSubmit={async (e) => {
                e.preventDefault()
                if (!commentText.trim() || commentLoading) return
                setCommentLoading(true)
                try {
                  await api.addComment(id, commentText.trim(), isInternal)
                  const cData = await api.fetchComments(id)
                  if (Array.isArray(cData)) {
                    setComments(cData)
                    setTimeout(() => commentsEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
                  }
                  setCommentText('')
                  setIsInternal(false)
                } catch(err) {
                  showAlert('Hata', 'Yorum gönderilemedi: ' + err.message)
                } finally {
                  setCommentLoading(false)
                }
              }}>
                {(isSupport || isManager) && (
                  <CannedResponses onSelect={(text) => setCommentText(prev => prev ? prev + '\n' + text : text)} />
                )}
                <textarea
                  className="td-comment-input"
                  placeholder="Bir mesaj yazın…"
                  value={commentText}
                  onChange={e => setCommentText(e.target.value)}
                  rows={3}
                  maxLength={1000}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) e.currentTarget.form.requestSubmit()
                  }}
                />
                <div className="td-comment-form-footer" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                  <span className="td-comment-char-count">{commentText.length}/1000 · Ctrl+Enter ile gönder</span>
                  <div style={{display: 'flex', alignItems: 'center', gap: '1rem'}}>
                    {(isSupport || isManager) && (
                      <label style={{display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: 'var(--mau-text-muted)', cursor: 'pointer'}}>
                        <input type="checkbox" checked={isInternal} onChange={e => setIsInternal(e.target.checked)} />
                        Dahili Not
                      </label>
                    )}
                    <button
                      type="submit"
                      className="td-action-btn td-action-btn--primary td-action-btn--compact"
                      disabled={!commentText.trim() || commentLoading}
                    >
                      {commentLoading ? 'Gönderiliyor…' : 'Gönder'}
                    </button>
                  </div>
                </div>
              </form>
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
              {(() => {
                if (ticket.status === 'closed' || ticket.status === 'pending_close') return null
                const hours = ticket.priority === 'high' ? 24 : ticket.priority === 'normal' ? 48 : 72
                const target = new Date(new Date(ticket.created_at).getTime() + hours * 60 * 60 * 1000)
                const isOverdue = new Date() > target
                return (
                  <li>
                    <strong>SLA Hedefi:</strong>{' '}
                    <span style={{ color: isOverdue ? '#ef4444' : 'inherit', fontWeight: isOverdue ? 'bold' : 'normal' }}>
                      {target.toLocaleString('tr-TR')} {isOverdue && ' (Aşıldı)'}
                    </span>
                  </li>
                )
              })()}
              {ticket.category && (
                <li>
                  <strong>Kategori:</strong> {ticket.category}
                </li>
              )}
              <li>
                <strong>Oluşturan:</strong> {ticket.owner_name}
              </li>
              <li>
                <strong>Atanan Kişiler:</strong> 
                {ticket.assignees && ticket.assignees.length > 0 ? (
                  <ul style={{ paddingLeft: '20px', marginTop: '4px', marginBottom: '0' }}>
                    {ticket.assignees.map(a => (
                      <li key={a.id} className={a.is_completed ? 'td-assignee-done' : 'td-assignee-pending'}>
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

              {isManager && assigneeTotal > 0 && (
                <div
                  className={`td-assignee-progress${allAssigneesComplete ? ' td-assignee-progress--ready' : ''}`}
                  role="status"
                >
                  <strong>
                    Personel ilerlemesi: {assigneeCompleted}/{assigneeTotal}
                  </strong>
                  <div className="td-assignee-progress-bar">
                    <div
                      className="td-assignee-progress-fill"
                      style={{ width: `${(assigneeCompleted / assigneeTotal) * 100}%` }}
                    />
                  </div>
                  {allAssigneesComplete ? (
                    <p>Tüm personel tamamladı. Talebi onaylayıp kapatabilirsiniz.</p>
                  ) : (
                    <p>{assigneeTotal - assigneeCompleted} personel henüz tamamlamadı.</p>
                  )}
                </div>
              )}

              {ticket.status === 'pending_close' && isManager && allAssigneesComplete && (
                <div className="td-pending-banner">
                  Onay bekleniyor — durumu &quot;Çözüldü / Kapalı&quot; yaparak talebi kapatabilirsiniz.
                </div>
              )}

              {isManager && (
                <div className="td-action-group">
                  <span className="td-field-label">Personel Ata</span>
                  <div className="td-assignee-list" role="group" aria-label="Personel seçimi">
                    {staff.length === 0 ? (
                      <p className="td-assignee-empty">Personel listesi yüklenemedi.</p>
                    ) : null}
                    {staff.map((s) => {
                      const sid = Number(s.id)
                      const selected = assignees.includes(sid)
                      return (
                        <button
                          key={s.id}
                          type="button"
                          className={`td-assignee-option${selected ? ' is-selected' : ''}`}
                          aria-pressed={selected}
                          onClick={() => handleAssigneeToggle(s.id)}
                        >
                          <span className="td-assignee-mark" aria-hidden="true">
                            {selected ? '✓' : ''}
                          </span>
                          <span>{s.display_name}</span>
                        </button>
                      )
                    })}
                  </div>
                  {assigneesSaving ? (
                    <p className="td-assignee-saving">Kaydediliyor…</p>
                  ) : null}
                  {assigneesError ? (
                    <p className="td-assignee-error">{assigneesError}</p>
                  ) : null}
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
                    {isManager && canManagerClose && (
                      <option value="closed">Çözüldü / Kapalı (Closed)</option>
                    )}
                    {isManager && !canManagerClose && assigneeTotal > 0 && (
                      <option value="closed" disabled>
                        Kapat (önce tüm personel tamamlasın)
                      </option>
                    )}
                    {ticket.status === 'pending_close' && (
                      <option value="pending_close" disabled>Onay Bekliyor (Pending)</option>
                    )}
                  </select>
                </div>
              </div>

              {/* Check if current user is assigned and has not completed */}
              {ticket.assignees?.some(a => Number(a.id) === Number(user?.id) && !a.is_completed) && ticket.status !== 'closed' && (
                <div className="td-action-group" style={{marginTop: '1.5rem'}}>
                  <button
                    type="button"
                    className="td-action-btn td-action-btn--primary"
                    onClick={handleCompletePart}
                    disabled={actionLoading}
                  >
                    Kendi kısmımı tamamladım
                  </button>
                </div>
              )}

              {isSupport && !isManager && assigneeTotal === 0 && ticket.status !== 'closed' && ticket.status !== 'pending_close' && (
                <div className="td-action-group" style={{ marginTop: '1rem' }}>
                  <button
                    type="button"
                    className="td-action-btn td-action-btn--success"
                    onClick={handleRequestClose}
                    disabled={actionLoading}
                  >
                    Çözüldü — yönetici onayına sun
                  </button>
                </div>
              )}

              {isSupport && !isManager && assigneeTotal > 0 && !allAssigneesComplete && (
                <p className="td-assignee-hint">
                  Tüm atanan personel &quot;Kendi kısmımı tamamladım&quot; dediğinde talep otomatik olarak yönetici onayına gider.
                </p>
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
                    type="button"
                    className="td-action-btn td-action-btn--primary td-action-btn--compact"
                    onClick={handleAddHistory}
                    disabled={!historyActionVal || actionLoading}
                  >
                    Ekle
                  </button>
                </div>
              </div>

              {(isSupport || isManager) && (
                <div className="td-action-group" style={{marginTop: '0.8rem'}}>
                  <button
                    type="button"
                    className="td-action-btn td-action-btn--danger"
                    onClick={handleBackupRequest}
                    disabled={actionLoading}
                  >
                    Ekip / yardım çağır
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
