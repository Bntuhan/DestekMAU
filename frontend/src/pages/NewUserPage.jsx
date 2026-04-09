import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth.jsx'
import * as api from '../api.js'
import './NewUserPage.css'

export default function NewUserPage() {
  const { token, isSuper } = useAuth()
  const navigate = useNavigate()
  
  const [formData, setFormData] = useState({
    display_name: '',
    email: '',
    password: '',
    role: 'user'
  })
  
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)

  if (!isSuper) {
    return <div className="nu-page"><p>Bu sayfayı görüntüleme yetkiniz yok.</p></div>
  }

  function handleChange(e) {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSuccess(false)
    
    try {
      await api.createUser(formData)
      
      setSuccess(true)
      setFormData({
        display_name: '',
        email: '',
        password: '',
        role: 'user'
      })
      
      // Navigate to the dashboard after a short delay
      setTimeout(() => {
        navigate('/app')
      }, 2000)
    } catch (err) {
      setError(err.message === 'email_exists_or_db_error' 
        ? 'Bu e-posta adresi zaten kullanımda veya veritabanı hatası oluştu.' 
        : 'Kullanıcı oluşturulurken bir hata oluştu.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="nu-page fade-in">
      <div className="nu-header">
        <h1 className="nu-title">Yeni Kullanıcı Ekle</h1>
        <p className="nu-subtitle">Sisteme yeni bir öğrenci veya personel hesabı tanımlayın.</p>
      </div>
      
      <div className="nu-card">
        {success && (
          <div className="nu-alert success">
            Kullanıcı başarıyla oluşturuldu. Yönlendiriliyorsunuz...
          </div>
        )}
        {error && (
          <div className="nu-alert error">
            {error}
          </div>
        )}
        
        <form onSubmit={handleSubmit} className="nu-form">
          <div className="nu-form-group">
            <label htmlFor="display_name">Ad Soyad</label>
            <input 
              type="text" 
              id="display_name" 
              name="display_name" 
              value={formData.display_name} 
              onChange={handleChange} 
              required 
              placeholder="Örn: Ahmet Yılmaz"
              autoComplete="name"
            />
          </div>
          
          <div className="nu-form-group">
            <label htmlFor="email">E-posta Adresi</label>
            <input 
              type="email" 
              id="email" 
              name="email" 
              value={formData.email} 
              onChange={handleChange} 
              required 
              placeholder="Örn: ahmet@maltepe.edu.tr"
              autoComplete="email"
            />
          </div>
          
          <div className="nu-form-group">
            <label htmlFor="password">Parola</label>
            <input 
              type="password" 
              id="password" 
              name="password" 
              value={formData.password} 
              onChange={handleChange} 
              required 
              minLength={6}
              placeholder="En az 6 karakter"
              autoComplete="new-password"
            />
          </div>
          
          <div className="nu-form-group">
            <label htmlFor="role">Rol</label>
            <div className="nu-select-wrap">
              <select 
                id="role" 
                name="role" 
                value={formData.role} 
                onChange={handleChange}
              >
                <option value="user">Öğrenci</option>
                <option value="support">Destek Personeli</option>
                <option value="manager">Yönetici</option>
              </select>
            </div>
          </div>
          
          <div className="nu-actions">
            <button 
              type="button" 
              className="nu-btn-secondary" 
              onClick={() => navigate('/app')}
              disabled={loading}
            >
              İptal
            </button>
            <button 
              type="submit" 
              className="nu-btn-primary"
              disabled={loading}
            >
              {loading ? 'Oluşturuluyor...' : 'Kullanıcıyı Kaydet'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
