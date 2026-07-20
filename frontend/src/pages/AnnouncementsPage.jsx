import { useState, useEffect } from 'react';
import './AnnouncementsPage.css';

export default function AnnouncementsPage() {
  const [announcements, setAnnouncements] = useState([]);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(false);

  const fetchAnnouncements = async () => {
    try {
      const res = await fetch('/api/announcements', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('destek_token')}` }
      });
      if (res.ok) {
        const data = await res.json();
        setAnnouncements(data);
      }
    } catch (error) {
      console.error('Fetch error:', error);
    }
  };

  useEffect(() => {
    fetchAnnouncements();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title || !body) return;
    setLoading(true);
    try {
      const res = await fetch('/api/announcements', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('destek_token')}`
        },
        body: JSON.stringify({ title, body })
      });
      if (res.ok) {
        setTitle('');
        setBody('');
        fetchAnnouncements();
      }
    } catch (error) {
      console.error('Create error:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleActive = async (id, currentStatus) => {
    try {
      const res = await fetch(`/api/announcements/${id}`, {
        method: 'PATCH',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('destek_token')}`
        },
        body: JSON.stringify({ is_active: !currentStatus })
      });
      if (res.ok) {
        fetchAnnouncements();
      }
    } catch (error) {
      console.error('Update error:', error);
    }
  };

  return (
    <div className="announcements-page fade-in">
      <div className="ap-header">
        <h1>Duyuru Yönetimi</h1>
        <p>Sistem genelindeki duyuruları yönetin.</p>
      </div>

      <div className="ap-grid">
        <div className="ap-form-card">
          <h2>Yeni Duyuru Ekle</h2>
          <form onSubmit={handleSubmit}>
            <div className="ap-form-group">
              <label>Başlık</label>
              <input 
                type="text" 
                value={title} 
                onChange={e => setTitle(e.target.value)} 
                required 
                placeholder="Örn: Sistem Bakımı"
              />
            </div>
            <div className="ap-form-group">
              <label>İçerik</label>
              <textarea 
                value={body} 
                onChange={e => setBody(e.target.value)} 
                required 
                rows={4}
                placeholder="Duyuru içeriği..."
              />
            </div>
            <button type="submit" className="mau-btn mau-btn--primary" disabled={loading}>
              {loading ? 'Ekleniyor...' : 'Duyuru Ekle'}
            </button>
          </form>
        </div>

        <div className="ap-list-card">
          <h2>Mevcut Duyurular</h2>
          <div className="ap-list">
            {announcements.length === 0 ? (
              <p className="ap-empty">Henüz duyuru bulunmamaktadır.</p>
            ) : (
              announcements.map(ann => (
                <div key={ann.id} className={`ap-item ${!ann.is_active ? 'ap-item-inactive' : ''}`}>
                  <div className="ap-item-content">
                    <h3>{ann.title}</h3>
                    <p>{ann.body}</p>
                    <span className="ap-meta">{ann.author_name} · {new Date(ann.created_at).toLocaleString('tr-TR')}</span>
                  </div>
                  <div className="ap-item-actions">
                    <label className="ap-toggle">
                      <input 
                        type="checkbox" 
                        checked={ann.is_active} 
                        onChange={() => toggleActive(ann.id, ann.is_active)}
                      />
                      <span className="ap-toggle-slider"></span>
                    </label>
                    <span className="ap-status-text">{ann.is_active ? 'Aktif' : 'Pasif'}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
