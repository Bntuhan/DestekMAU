import { useState, useEffect } from 'react';
import './AnnouncementBanner.css';

export default function AnnouncementBanner() {
  const [announcements, setAnnouncements] = useState([]);
  const [dismissed, setDismissed] = useState([]);

  useEffect(() => {
    const fetchAnnouncements = async () => {
      try {
        const res = await fetch('/api/announcements', {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('destek_token')}` }
        });
        if (res.ok) {
          const data = await res.json();
          const activeAnns = data.filter(a => a.is_active);
          setAnnouncements(activeAnns);
        }
      } catch (error) {
        console.error('Announcements fetch error:', error);
      }
    };
    fetchAnnouncements();

    const sessDismissed = JSON.parse(sessionStorage.getItem('dismissed_announcements') || '[]');
    setDismissed(sessDismissed);
  }, []);

  const dismiss = (id) => {
    const newDismissed = [...dismissed, id];
    setDismissed(newDismissed);
    sessionStorage.setItem('dismissed_announcements', JSON.stringify(newDismissed));
  };

  const visibleAnnouncements = announcements.filter(a => !dismissed.includes(a.id));

  if (visibleAnnouncements.length === 0) return null;

  return (
    <div className="announcement-container">
      {visibleAnnouncements.map(ann => (
        <div key={ann.id} className="announcement-banner">
          <div className="announcement-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="16" x2="12" y2="12"></line>
              <line x1="12" y1="8" x2="12.01" y2="8"></line>
            </svg>
          </div>
          <div className="announcement-content">
            <strong className="announcement-title">{ann.title}</strong>
            <p className="announcement-body">{ann.body}</p>
            <span className="announcement-meta">{ann.author_name} · {new Date(ann.created_at).toLocaleDateString('tr-TR')}</span>
          </div>
          <button className="announcement-close" onClick={() => dismiss(ann.id)} aria-label="Kapat">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}
