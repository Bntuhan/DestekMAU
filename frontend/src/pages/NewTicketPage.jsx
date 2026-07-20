import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as api from '../api.js'
import './NewTicketPage.css'

export default function NewTicketPage() {
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState('normal')
  const [files, setFiles] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [isDragging, setIsDragging] = useState(false)

  function handleFiles(incomingFiles) {
    setError('')
    if (files.length + incomingFiles.length > 3) {
      setError('Maksimum 3 dosya yükleyebilirsiniz.')
      return
    }

    const validFiles = []
    for (let f of incomingFiles) {
      if (f.size > 10 * 1024 * 1024) {
        setError('Dosya boyutu en fazla 10MB olabilir: ' + f.name)
        return
      }
      const ext = f.name.split('.').pop().toLowerCase()
      const allowed = ['jpg', 'jpeg', 'png', 'gif', 'pdf', 'txt', 'log', 'doc', 'docx']
      if (!allowed.includes(ext)) {
        setError('Sadece izin verilen türler: jpg, png, pdf, txt vb. Geçersiz: ' + f.name)
        return
      }
      validFiles.push(f)
    }

    setFiles(prev => [...prev, ...validFiles])
  }

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      let photo_path = ""
      if (files.length > 0) {
        const uploadPromises = files.map(f => api.uploadFile(f))
        const uploadResults = await Promise.all(uploadPromises)
        photo_path = uploadResults.map(res => res.url).join(',')
      }
      await api.createTicket({ title: title.trim(), description: description.trim(), category, priority, photo_path })
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
            <span>Kategori</span>
            <select
              className="mau-input"
              style={{
                width: '100%',
                padding: '0.6rem',
                border: '1px solid var(--mau-border)',
                borderRadius: 'var(--mau-radius-md)',
                marginTop: '4px',
                fontSize: '0.95rem'
              }}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              required
            >
              <option value="" disabled>-- Lütfen Bir Kategori Seçiniz --</option>
              <optgroup label="💻 Bilgi İşlem / Ağ ve Erişim (IT)">
                <option value="Wi-Fi (Eduroam) Bağlantı Sağlanamıyor">Wi-Fi (Eduroam) Bağlantı Sağlanamıyor</option>
                <option value="Kurumsal E-posta Şifre Sıfırlama / Giriş Sorunu">Kurumsal E-posta Şifre Sıfırlama / Giriş Sorunu</option>
                <option value="Öğrenci Sistemine (OBS / LMS) Giriş Yapılamıyor">Öğrenci Sistemine (OBS / LMS) Giriş Yapılamıyor</option>
                <option value="Sunucu / VPN Erişim Talebi">Sunucu / VPN Erişim Talebi</option>
              </optgroup>
              <optgroup label="🖥️ Donanım ve Sınıf İçi Teknolojiler">
                <option value="Projeksiyon Cihazı Çalışmıyor / Görüntü Yok">Projeksiyon Cihazı Çalışmıyor / Görüntü Yok</option>
                <option value="Laboratuvar Bilgisayarı Açılmıyor / Mavi Ekran">Laboratuvar Bilgisayarı Açılmıyor / Mavi Ekran</option>
                <option value="Akıllı Tahta Dokunmatik Hatası / Kalibrasyon">Akıllı Tahta Dokunmatik Hatası / Kalibrasyon</option>
                <option value="Yazıcı (Printer) Çıktı Vermiyor / Kağıt Sıkışması">Yazıcı (Printer) Çıktı Vermiyor / Kağıt Sıkışması</option>
              </optgroup>
              <optgroup label="📄 İdari İşler ve Belge Yönetimi">
                <option value="Öğrenci Belgesi / Transkript Talep Hatası">Öğrenci Belgesi / Transkript Talep Hatası</option>
                <option value="Kimlik Kartı Kayıp / Yenileme Talebi">Kimlik Kartı Kayıp / Yenileme Talebi</option>
                <option value="Ders Kayıt Süreci Hataları (Danışman Onayı vb.)">Ders Kayıt Süreci Hataları (Danışman Onayı vb.)</option>
              </optgroup>
              <optgroup label="🏢 Fiziksel Altyapı ve Tesis Yönetimi">
                <option value="Sınıf İçi Elektrik / Priz Arızası">Sınıf İçi Elektrik / Priz Arızası</option>
                <option value="Klima / Havalandırma Çalışmıyor">Klima / Havalandırma Çalışmıyor</option>
                <option value="Temizlik ve Hijyen Şikayetleri">Temizlik ve Hijyen Şikayetleri</option>
                <option value="Asansör veya Kapı / Turnike Arızası">Asansör veya Kapı / Turnike Arızası</option>
              </optgroup>
              <optgroup label="❓ Diğer Başlıklar">
                <option value="Diğer (Lütfen Açıklamada Belirtiniz)">Diğer (Lütfen Açıklamada Belirtiniz)</option>
              </optgroup>
            </select>
          </label>
          <label className="mau-field">
            <span>Konu Başlığı (Özet)</span>
            <input
              type="text"
              className="mau-input"
              placeholder="Örn: Bilgisayarım açılmıyor"
              value={title}
              onChange={e => setTitle(e.target.value)}
              required
              maxLength={100}
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
          <label className="mau-field" style={{ display: 'block' }}>
            <span style={{ display: 'block', marginBottom: '8px' }}>Dosya Ekle (İsteğe Bağlı, Maksimum 3 dosya)</span>
            <div 
              className={`file-drop-zone ${isDragging ? 'dragging' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                handleFiles(Array.from(e.dataTransfer.files));
              }}
              onClick={() => document.getElementById('fileInput').click()}
            >
              <input
                id="fileInput"
                type="file"
                multiple
                accept=".jpg,.jpeg,.png,.gif,.pdf,.txt,.log,.doc,.docx"
                style={{ display: 'none' }}
                onChange={(e) => handleFiles(Array.from(e.target.files))}
              />
              <div className="file-drop-message">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="24" height="24">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                <p>Dosyaları sürükleyip bırakın veya seçmek için tıklayın</p>
                <small>Max 10MB/dosya. İzin verilen türler: jpg, png, pdf, txt vb.</small>
              </div>
            </div>
            {files.length > 0 && (
              <ul className="file-list">
                {files.map((f, i) => (
                  <li key={i} className="file-list-item">
                    <span>{f.name} ({(f.size / (1024 * 1024)).toFixed(2)} MB)</span>
                    <button type="button" onClick={() => setFiles(prev => prev.filter((_, idx) => idx !== i))}>
                      &times;
                    </button>
                  </li>
                ))}
              </ul>
            )}
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
