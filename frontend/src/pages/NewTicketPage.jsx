import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as api from '../api.js'
import './NewTicketPage.css'

export default function NewTicketPage() {
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState('normal')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await api.createTicket({ title: title.trim(), description: description.trim(), priority })
      navigate('/app', { replace: true })
    } catch (err) {
      setError(err.message || 'Kaydedilemedi')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="new-ticket mau-page mau-page--narrow">
      <header className="new-ticket-hero">
        <h1 className="new-ticket-hero-title">Yeni destek talebi</h1>
        <p className="new-ticket-hero-lead">
          Sorununuzu net tarif edin; ekibimiz talebi öncelik ve kategoriye göre işler.
        </p>
      </header>

      <form className="mau-card new-ticket-card" onSubmit={onSubmit} noValidate>
        <div className="mau-card__header">
          <h2 className="mau-card__title">Talep formu</h2>
          <p className="mau-card__subtitle">
            Zorunlu alanları doldurun. Mümkünse ekran görüntüsü veya hata kodu ekleyin.
          </p>
          <div className="mau-card__accent" aria-hidden />
        </div>
        <div className="mau-card__body new-ticket-fields">
          <label className="mau-field">
            <span>Başlık</span>
            <input
              className="mau-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              maxLength={200}
              placeholder="Kısa özet"
              autoComplete="off"
            />
          </label>
          <label className="mau-field">
            <span>Öncelik</span>
            <select value={priority} onChange={(e) => setPriority(e.target.value)}>
              <option value="low">Düşük</option>
              <option value="normal">Normal</option>
              <option value="high">Yüksek</option>
            </select>
          </label>
          <label className="mau-field">
            <span>Açıklama</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
              rows={8}
              placeholder="Sorunu adım adım yazın; hata mesajı varsa ekleyin."
            />
          </label>
          {error ? <p className="new-ticket-error">{error}</p> : null}
          <div className="new-ticket-actions">
            <button type="button" className="mau-btn mau-btn--ghost" onClick={() => navigate(-1)}>
              Vazgeç
            </button>
            <button type="submit" className="mau-btn mau-btn--primary" disabled={loading}>
              {loading ? 'Gönderiliyor…' : 'Talebi oluştur'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
