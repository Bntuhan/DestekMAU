import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth.jsx'
import './LoginPage.css'

const announcements = [
  {
    title: 'Destek talebi oluşturma',
    date: '28 Mar 2026',
    body: 'Sorununuzu kısa ve net yazın; ekran görüntüsü eklemek çözüm süresini kısaltır.',
  },
  {
    title: 'Çalışma saatleri',
    date: '25 Mar 2026',
    body: 'Talepler sıraya alınır; yoğun dönemlerde yanıt süresi uzayabilir.',
  },
  {
    title: 'Şifre güvenliği',
    date: '20 Mar 2026',
    body: 'Destek formunda asla şifrenizi paylaşmayın. Kimlik doğrulama yalnızca giriş ekranındadır.',
  },
]

export default function LoginPage() {
  const { signIn, user, ready } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (ready && user) navigate('/app', { replace: true })
  }, [ready, user, navigate])

  if (!ready) {
    return (
      <div className="login-root">
        <div className="login-bg" aria-hidden />
        <p className="login-loading">Yükleniyor…</p>
      </div>
    )
  }

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await signIn(email.trim(), password)
      navigate('/app', { replace: true })
    } catch (err) {
      setError(err.message || 'Giriş yapılamadı')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-root">
      <div className="login-bg" aria-hidden />
      <div className="login-columns">
        <section className="login-panel login-panel--brand">
          <h1 className="login-uni">Maltepe Üniversitesi</h1>
          <img src="/maltepe-logo.png" alt="Maltepe Üniversitesi Logosu" className="login-logo-mark" />
          <p className="login-intro">
            Bilgi işlem destek portalına hoş geldiniz. Taleplerinizi açın, durumunu takip edin;
            yetkili personel atama ve kapatma işlemlerini yürütür.
          </p>
          <p className="login-demo-hint">
            <strong>Demo:</strong> ogrenci@maltepe.edu.tr / artuklu2026 — destek@maltepe.edu.tr / super2026
          </p>
        </section>

        <section className="login-panel login-panel--form">
          <div className="login-form-header">
            <img src="/maltepe-logo.png" alt="Logomuz" className="login-form-logo" />
            <div>
              <h2 className="login-heading">Kullanıcı girişi</h2>
              <p className="login-note">Kurumsal e-postanızı kullanın.</p>
            </div>
          </div>
          <form className="login-form" onSubmit={onSubmit}>
            <label className="login-label">
              E-posta
              <input
                className="login-input"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>
            <label className="login-label">
              Şifre
              <input
                className="login-input"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>
            {error ? <p className="login-error">{error}</p> : null}
            <button type="submit" className="login-btn login-btn--primary" disabled={loading}>
              {loading ? 'Giriş…' : 'Oturum aç'}
            </button>
          </form>
          <p className="login-footer-link">Gizlilik politikası (örnek)</p>
        </section>

        <section className="login-panel login-panel--news">
          <h2 className="login-heading">Duyurular</h2>
          <ul className="login-announcements">
            {announcements.map((a) => (
              <li key={a.title} className="login-announcement">
                <div className="login-announcement-head">
                  <strong>{a.title}</strong>
                  <span className="login-announcement-date">{a.date}</span>
                </div>
                <p>{a.body}</p>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}
