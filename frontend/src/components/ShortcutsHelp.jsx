import './ShortcutsHelp.css';

export default function ShortcutsHelp({ open, onClose }) {
  if (!open) return null;

  return (
    <div className="shortcuts-modal-overlay" onClick={onClose}>
      <div className="shortcuts-modal-content" onClick={e => e.stopPropagation()}>
        <div className="shortcuts-modal-header">
          <h2>Klavye Kısayolları</h2>
          <button className="shortcuts-close-btn" onClick={onClose}>✕</button>
        </div>
        <div className="shortcuts-grid">
          <div className="shortcut-item">
            <span className="shortcut-desc">Komut Paleti</span>
            <span className="shortcut-keys"><kbd>Cmd/Ctrl</kbd> + <kbd>K</kbd></span>
          </div>
          <div className="shortcut-item">
            <span className="shortcut-desc">Kısayol Yardımı</span>
            <span className="shortcut-keys"><kbd>?</kbd></span>
          </div>
          <div className="shortcut-item">
            <span className="shortcut-desc">Kapat/İptal</span>
            <span className="shortcut-keys"><kbd>ESC</kbd></span>
          </div>
        </div>
      </div>
    </div>
  );
}
