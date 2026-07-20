import { useEffect } from 'react';
import './Lightbox.css';

export default function Lightbox({ open, src, onClose, alt }) {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="lightbox-backdrop" onClick={onClose}>
      <button className="lightbox-close" onClick={onClose} aria-label="Kapat">✕</button>
      <div className="lightbox-content" onClick={e => e.stopPropagation()}>
        <img className="lightbox-img" src={src} alt={alt || 'Önizleme'} />
      </div>
    </div>
  );
}
