import { useEffect } from 'react';

/** Small confirmation dialog for destructive actions. */
export default function Confirm({ title, children, confirmLabel = 'Confirm', danger = false, busy = false, onConfirm, onCancel }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div className="modal-back" onMouseDown={onCancel}>
      <div className="modal confirm" role="alertdialog" aria-labelledby="confirm-title" onMouseDown={(e) => e.stopPropagation()}>
        <h3 id="confirm-title" style={{ marginBottom: 8 }}>{title}</h3>
        <div style={{ color: 'var(--muted-strong)', fontSize: 14, marginBottom: 20 }}>{children}</div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="btn ghost" onClick={onCancel} disabled={busy}>Cancel</button>
          <button className={`btn ${danger ? 'danger' : ''}`} onClick={onConfirm} disabled={busy} autoFocus>
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
