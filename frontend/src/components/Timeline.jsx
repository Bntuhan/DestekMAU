import './Timeline.css';

export default function Timeline({ items }) {
  if (!items || items.length === 0) return null;

  const getDotColor = (action) => {
    const act = action.toLowerCase();
    if (act.includes('çözüldü') || act.includes('kapandı') || act.includes('tamam')) return 'tl-dot-green';
    if (act.includes('atandı') || act.includes('yönlendirildi')) return 'tl-dot-blue';
    if (act.includes('açıldı') || act.includes('oluşturuldu')) return 'tl-dot-magenta';
    if (act.includes('yorum') || act.includes('mesaj') || act.includes('uyarıldı')) return 'tl-dot-orange';
    return 'tl-dot-default';
  };

  return (
    <div className="timeline-container">
      {items.map((item, index) => (
        <div key={item.id || index} className="timeline-item fade-in" style={{ animationDelay: `${index * 0.1}s` }}>
          <div className="timeline-line"></div>
          <div className={`timeline-dot ${getDotColor(item.action)}`}></div>
          <div className="timeline-content">
            <div className="timeline-header">
              <span className="timeline-time">{new Date(item.created_at).toLocaleString('tr-TR')}</span>
              <span className="timeline-user">{item.user_name}</span>
            </div>
            <div className="timeline-action">{item.action}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
