import { useState, useMemo } from 'react'
import { useAuth } from '../auth.jsx'
import Modal from '../components/Modal.jsx'
import './ProfilePage.css'

/* ── Rol etiketi ── */
const ROLE_LABELS = {
  student:   'Öğrenci',
  support:   'Destek Personeli',
  manager:   'Yönetici',
  superuser: 'Süper Admin',
}

/* ── Şifre gücü ── */
function evaluateStrength(pw) {
  if (!pw) return { level: 0, label: '', key: 'none' }
  let score = 0
  if (pw.length >= 8)  score++
  if (pw.length >= 12) score++
  if (/[A-Z]/.test(pw)) score++
  if (/[0-9]/.test(pw)) score++
  if (/[^A-Za-z0-9]/.test(pw)) score++
  if (score <= 1) return { level: 1, label: 'Zayıf',   key: 'weak'   }
  if (score <= 3) return { level: 2, label: 'Orta',    key: 'medium' }
  return              { level: 3, label: 'Güçlü',   key: 'strong'  }
}

/* ── Avatar initials ── */
function getInitials(name) {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export default function ProfilePage() {
  const { user } = useAuth()

  /* form state */
  const [form, setForm] = useState({
    currentPassword:  '',
    newPassword:      '',
    confirmPassword:  '',
  })
  const [loading,  setLoading]  = useState(false)
  const [modal,    setModal]    = useState({ open: false, type: 'alert', title: '', message: '' })
  const [fieldErr, setFieldErr] = useState({})
  const [showPw,   setShowPw]   = useState({ cur: false, new: false, conf: false })

  const strength = useMemo(() => evaluateStrength(form.newPassword), [form.newPassword])

  const closeModal = () => setModal(m => ({ ...m, open: false }))

  /* ── Field change ── */
  function handleChange(e) {
    const { name, value } = e.target
    setForm(prev => ({ ...prev, [name]: value }))
    setFieldErr(prev => ({ ...prev, [name]: '' }))
  }

  /* ── Validation ── */
  function validate() {
    const errors = {}
    if (!form.currentPassword)
      errors.currentPassword = 'Mevcut şifrenizi girin.'
    if (!form.newPassword || form.newPassword.length < 8)
      errors.newPassword = 'Yeni şifre en az 8 karakter olmalıdır.'
    if (form.newPassword !== form.confirmPassword)
      errors.confirmPassword = 'Şifreler eşleşmiyor.'
    return errors
  }

  /* ── Submit ── */
  async function handleSubmit(e) {
    e.preventDefault()
    const errors = validate()
    if (Object.keys(errors).length) {
      setFieldErr(errors)
      return
    }

    setLoading(true)
    try {
      const token = localStorage.getItem('destek_token')
      const res   = await fetch('/api/me/password', {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          current_password: form.currentPassword,
          new_password:     form.newPassword,
        }),
      })

      if (res.ok) {
        setForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
        setModal({
          open:    true,
          type:    'alert',
          title:   'Şifre Güncellendi',
          message: 'Şifreniz başarıyla değiştirildi.',
        })
      } else {
        const data = await res.json().catch(() => ({}))
        setModal({
          open:    true,
          type:    'danger',
          title:   'Hata',
          message: data?.detail || data?.message || 'Şifre değiştirilemedi. Mevcut şifrenizi kontrol edin.',
        })
      }
    } catch {
      setModal({
        open:    true,
        type:    'danger',
        title:   'Bağlantı Hatası',
        message: 'Sunucuya ulaşılamadı. Lütfen tekrar deneyin.',
      })
    } finally {
      setLoading(false)
    }
  }

  const roleLabel   = ROLE_LABELS[user?.role] ?? user?.role ?? '—'
  const initials    = getInitials(user?.display_name)
  const displayName = user?.display_name ?? '—'
  const email       = user?.email ?? '—'

  const strengthPct = strength.level === 0 ? 0
    : strength.level === 1 ? 33
    : strength.level === 2 ? 66
    : 100

  return (
    <div className="profile-page fade-in">

      {/* ── Header card ── */}
      <div className="profile-header-card mau-card">
        <div className="profile-avatar" aria-hidden="true">
          {initials}
        </div>
        <div className="profile-header-info">
          <h1 className="profile-display-name">{displayName}</h1>
          <p className="profile-email">{email}</p>
          <span className={`profile-role-badge profile-role-badge--${user?.role ?? 'student'}`}>
            {roleLabel}
          </span>
        </div>
      </div>

      {/* ── Password change card ── */}
      <div className="profile-pw-card mau-card">
        <div className="mau-card__header">
          <h2 className="mau-card__title">
            <span className="profile-section-icon" aria-hidden="true">🔒</span>
            Şifre Değiştir
          </h2>
          <p className="mau-card__subtitle">
            Güvenliğiniz için şifrenizi düzenli aralıklarla güncelleyin.
          </p>
          <div className="mau-card__accent" />
        </div>

        <form className="mau-card__body profile-pw-form" onSubmit={handleSubmit} noValidate>

          {/* Mevcut Şifre */}
          <div className="mau-field">
            <span>Mevcut Şifre</span>
            <div className="profile-input-wrap">
              <input
                id="currentPassword"
                name="currentPassword"
                type={showPw.cur ? 'text' : 'password'}
                className={`mau-input${fieldErr.currentPassword ? ' mau-input--error' : ''}`}
                placeholder="Mevcut şifrenizi girin"
                value={form.currentPassword}
                onChange={handleChange}
                autoComplete="current-password"
                aria-describedby={fieldErr.currentPassword ? 'err-cur' : undefined}
              />
              <button
                type="button"
                className="profile-eye-btn"
                onClick={() => setShowPw(s => ({ ...s, cur: !s.cur }))}
                aria-label={showPw.cur ? 'Şifreyi gizle' : 'Şifreyi göster'}
              >
                {showPw.cur ? '🙈' : '👁️'}
              </button>
            </div>
            {fieldErr.currentPassword && (
              <span id="err-cur" className="profile-field-error" role="alert">
                {fieldErr.currentPassword}
              </span>
            )}
          </div>

          {/* Yeni Şifre */}
          <div className="mau-field">
            <span>Yeni Şifre</span>
            <div className="profile-input-wrap">
              <input
                id="newPassword"
                name="newPassword"
                type={showPw.new ? 'text' : 'password'}
                className={`mau-input${fieldErr.newPassword ? ' mau-input--error' : ''}`}
                placeholder="En az 8 karakter"
                value={form.newPassword}
                onChange={handleChange}
                autoComplete="new-password"
                aria-describedby={fieldErr.newPassword ? 'err-new' : 'strength-hint'}
              />
              <button
                type="button"
                className="profile-eye-btn"
                onClick={() => setShowPw(s => ({ ...s, new: !s.new }))}
                aria-label={showPw.new ? 'Şifreyi gizle' : 'Şifreyi göster'}
              >
                {showPw.new ? '🙈' : '👁️'}
              </button>
            </div>
            {fieldErr.newPassword && (
              <span id="err-new" className="profile-field-error" role="alert">
                {fieldErr.newPassword}
              </span>
            )}

            {/* Strength bar */}
            {form.newPassword && (
              <div className="profile-strength" id="strength-hint" aria-live="polite">
                <div className="profile-strength-track">
                  <div
                    className={`profile-strength-bar profile-strength-bar--${strength.key}`}
                    style={{ width: `${strengthPct}%` }}
                  />
                </div>
                <span className={`profile-strength-label profile-strength-label--${strength.key}`}>
                  {strength.label}
                </span>
              </div>
            )}
          </div>

          {/* Şifre Tekrar */}
          <div className="mau-field">
            <span>Yeni Şifre (Tekrar)</span>
            <div className="profile-input-wrap">
              <input
                id="confirmPassword"
                name="confirmPassword"
                type={showPw.conf ? 'text' : 'password'}
                className={`mau-input${fieldErr.confirmPassword ? ' mau-input--error' : ''}`}
                placeholder="Şifrenizi tekrar girin"
                value={form.confirmPassword}
                onChange={handleChange}
                autoComplete="new-password"
                aria-describedby={fieldErr.confirmPassword ? 'err-conf' : undefined}
              />
              <button
                type="button"
                className="profile-eye-btn"
                onClick={() => setShowPw(s => ({ ...s, conf: !s.conf }))}
                aria-label={showPw.conf ? 'Şifreyi gizle' : 'Şifreyi göster'}
              >
                {showPw.conf ? '🙈' : '👁️'}
              </button>
            </div>
            {fieldErr.confirmPassword && (
              <span id="err-conf" className="profile-field-error" role="alert">
                {fieldErr.confirmPassword}
              </span>
            )}
          </div>

          {/* Actions */}
          <div className="profile-pw-actions">
            <button
              type="submit"
              className="mau-btn mau-btn--primary"
              disabled={loading}
              id="btn-change-password"
            >
              {loading ? (
                <>
                  <span className="profile-spinner" aria-hidden="true" />
                  Güncelleniyor…
                </>
              ) : (
                'Şifreyi Güncelle'
              )}
            </button>
          </div>

        </form>
      </div>

      {/* ── Modal ── */}
      <Modal
        open={modal.open}
        type={modal.type}
        title={modal.title}
        message={modal.message}
        onConfirm={closeModal}
        onCancel={closeModal}
      />
    </div>
  )
}
