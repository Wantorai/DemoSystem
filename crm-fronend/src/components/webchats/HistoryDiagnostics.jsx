'use client';

import { memo, useRef, useState, useSyncExternalStore } from 'react';

const getServerSnapshot = () => null;

// Keep scroll diagnostics out of the chat's React state. Publishing is bounded
// even while Safari emits a scroll event on every animation frame.
export function createHistoryDiagnostics() {
  let snapshot = null;
  let pendingSnapshot = null;
  let timer = null;
  const listeners = new Set();

  const clearPending = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    pendingSnapshot = null;
  };
  const reset = () => {
    clearPending();
    snapshot = null;
    listeners.forEach(listener => listener());
  };

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    publish(nextSnapshot) {
      if (nextSnapshot == null) {
        reset();
        return;
      }
      pendingSnapshot = nextSnapshot;
      if (timer !== null) return;
      timer = setTimeout(() => {
        timer = null;
        snapshot = pendingSnapshot;
        pendingSnapshot = null;
        listeners.forEach(listener => listener());
      }, 250);
    },
    reset,
    // No permanent "disposed" flag: React StrictMode can set up the same store
    // again after cleanup. Subscribers own their individual unsubscriptions.
    dispose() {
      clearPending();
      snapshot = null;
    },
  };
}

const buttonStyle = {
  margin: 0,
  padding: '4px 8px',
  border: '1px solid #cbd5e1',
  borderRadius: 6,
  background: '#fff',
  color: '#334155',
  fontSize: 12,
  lineHeight: '18px',
};

function DiagnosticsPanel({ store, onClose }) {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, getServerSnapshot);
  const fieldRef = useRef(null);
  const [copyStatus, setCopyStatus] = useState('');
  const serialized = snapshot ? JSON.stringify(snapshot, null, 2) : '';

  const copy = async () => {
    if (!serialized) return;
    try {
      await navigator.clipboard.writeText(serialized);
      setCopyStatus('Скопировано');
    } catch {
      const field = fieldRef.current;
      if (field) {
        field.focus({ preventScroll: true });
        field.setSelectionRange(0, field.value.length);
      }
      setCopyStatus('Скопируйте выделенный текст');
    }
  };

  return (
    <div
      role="region"
      aria-label="Диагностика истории чата"
      style={{
        position: 'absolute', bottom: '100%', left: 0, right: 0, zIndex: 1200,
        height: 'min(50dvh, 320px)', minHeight: 0, boxSizing: 'border-box',
        display: 'flex', flexDirection: 'column', gap: 6, padding: 8,
        background: '#fff', color: '#334155', border: '1px solid #cbd5e1',
        borderRadius: '8px 8px 0 0', boxShadow: '0 -2px 12px #0002',
        overflow: 'hidden',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <button type="button" disabled={!serialized} onClick={copy} style={buttonStyle}>
          Скопировать
        </button>
        <span role="status" style={{ flex: 1, minWidth: 0, fontSize: 12, lineHeight: '16px' }}>
          {copyStatus}
        </span>
        <button type="button" onClick={onClose} style={buttonStyle}>Закрыть</button>
      </div>
      <textarea
        ref={fieldRef}
        readOnly
        aria-label="Замеры истории"
        placeholder="Ожидание загрузки истории…"
        value={serialized}
        style={{
          flex: 1, width: '100%', minHeight: 0, margin: 0, padding: 6,
          boxSizing: 'border-box', resize: 'none', overflow: 'auto',
          fontSize: 16, lineHeight: '20px', color: '#111827', background: '#f8fafc',
          userSelect: 'text', WebkitUserSelect: 'text',
        }}
      />
    </div>
  );
}

const HistoryDiagnostics = memo(function HistoryDiagnostics({ store }) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ position: 'relative', height: 28, minHeight: 28, flexShrink: 0, width: '100%', minWidth: 0 }}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(value => !value)}
        style={{
          display: 'block', width: '100%', height: 28, margin: 0, padding: '0 12px',
          border: 0, background: '#fff', color: '#475569', textAlign: 'left',
          fontSize: 12, lineHeight: '28px', whiteSpace: 'nowrap', overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        Диагностика истории
      </button>
      {open && <DiagnosticsPanel store={store} onClose={() => setOpen(false)} />}
    </div>
  );
});

export default HistoryDiagnostics;
