import { useEffect, useRef } from 'react'
import './Modal.css'

/**
 * Genel amaçlı Modal bileşeni.
 *
 * Kullanım:
 *   <Modal
 *     open={showModal}
 *     type="confirm"           // 'alert' | 'confirm' | 'danger'
 *     title="Emin misiniz?"
 *     message="Bu işlem geri alınamaz."
 *     confirmLabel="Evet"      // opsiyonel, varsayılan: "Tamam"
 *     cancelLabel="Vazgeç"     // opsiyonel, varsayılan: "İptal"
 *     onConfirm={() => ...}
 *     onCancel={() => ...}     // alert tipinde kullanılmaz
 *   />
 */
export default function Modal({
  open,
  type = 'alert',      // 'alert' | 'confirm' | 'danger'
  title,
  message,
  confirmLabel,
  cancelLabel = 'İptal',
  onConfirm,
  onCancel,
}) {
  const confirmBtnRef = useRef(null)

  // Modal açıldığında onay butonuna fokus ver
  useEffect(() => {
    if (open && confirmBtnRef.current) {
      confirmBtnRef.current.focus()
    }
  }, [open])

  // ESC tuşuyla kapatma
  useEffect(() => {
    if (!open) return
    function handleKey(e) {
      if (e.key === 'Escape') {
        if (type === 'alert') onConfirm?.()
        else onCancel?.()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open, type, onConfirm, onCancel])

  if (!open) return null

  const defaultConfirmLabel =
    type === 'alert' ? 'Tamam' : type === 'danger' ? 'Evet, devam et' : 'Tamam'

  return (
    <div className="modal-backdrop" onClick={type === 'alert' ? onConfirm : onCancel} role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div className={`modal-box modal-box--${type}`} onClick={e => e.stopPropagation()}>
        {/* İkon */}
        <div className={`modal-icon modal-icon--${type}`} aria-hidden="true">
          {type === 'alert' && (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          )}
          {type === 'confirm' && (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4" />
            </svg>
          )}
          {type === 'danger' && (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          )}
        </div>

        {title && <h2 className="modal-title" id="modal-title">{title}</h2>}
        {message && <p className="modal-message">{message}</p>}

        <div className="modal-actions">
          {type !== 'alert' && (
            <button
              type="button"
              className="modal-btn modal-btn--cancel"
              onClick={onCancel}
            >
              {cancelLabel}
            </button>
          )}
          <button
            ref={confirmBtnRef}
            type="button"
            className={`modal-btn modal-btn--confirm modal-btn--${type}`}
            onClick={onConfirm}
          >
            {confirmLabel || defaultConfirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
