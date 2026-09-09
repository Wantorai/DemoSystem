'use client';

import React, { useEffect, useState } from 'react';
import { IoCloseOutline } from 'react-icons/io5';
import { applyWebChatFontScale } from '../AppStyleLoader';

export default function WebchatFontScaleControl({ token, apiBase, buttonStyle, activeButtonStyle }) {
  const [mode] = useState(() => (
    typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches ? 'mobile' : 'desktop'
  ));
  const [open, setOpen] = useState(false);
  const [savedPercent, setSavedPercent] = useState(100);
  const [draftPercent, setDraftPercent] = useState(100);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    fetch(`${apiBase}/user-settings/webchat-text-scale?mode=${mode}`, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
    })
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((data) => {
        if (cancelled) return;
        const percent = Math.min(160, Math.max(80, Math.round(Number(data?.percent) || 100)));
        setSavedPercent(percent);
        setDraftPercent(percent);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [apiBase, mode, token]);

  const close = () => {
    applyWebChatFontScale(savedPercent);
    setDraftPercent(savedPercent);
    setError('');
    setOpen(false);
  };

  const save = async () => {
    const percent = Math.min(160, Math.max(80, Math.round(Number(draftPercent) || 100)));
    setSaving(true);
    setError('');
    try {
      const response = await fetch(`${apiBase}/user-settings/webchat-text-scale`, {
        method: 'PUT',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ mode, percent }),
      });
      if (!response.ok) throw new Error('Не удалось сохранить размер текста');
      setSavedPercent(percent);
      setDraftPercent(percent);
      window.dispatchEvent(new CustomEvent('webchat-font-scale-changed', { detail: { mode, percent } }));
      setOpen(false);
    } catch (saveError) {
      setError(saveError?.message || 'Не удалось сохранить размер текста');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button
        type="button"
        title="Размер текста в чатах"
        onClick={() => { setDraftPercent(savedPercent); setError(''); setOpen(true); }}
        style={savedPercent !== 100 ? activeButtonStyle : buttonStyle}
        aria-label="Настроить размер текста в чатах"
      >
        <span aria-hidden="true" style={{ fontSize: 21, lineHeight: 1, fontWeight: 700 }}>A</span>
      </button>
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Размер текста в чатах"
          onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}
          style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(15,23,42,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
        >
          <div style={{ width: 'min(420px, calc(100vw - 32px))', background: '#fff', color: '#111827', borderRadius: 14, boxShadow: '0 18px 50px rgba(15,23,42,0.25)', border: '1px solid rgba(229,231,235,0.95)', padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ fontSize: 17, fontWeight: 700 }}>
                Размер текста — {mode === 'mobile' ? 'телефон' : 'компьютер'}
              </div>
              <button type="button" onClick={close} aria-label="Закрыть" style={{ ...buttonStyle, width: 34, height: 34, borderRadius: 9 }}>
                <IoCloseOutline size={22} />
              </button>
            </div>
            <div style={{ marginTop: 18, display: 'flex', alignItems: 'center', gap: 14 }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>A</span>
              <input
                type="range"
                min="80"
                max="160"
                step="5"
                value={draftPercent}
                onChange={(event) => {
                  const percent = Number(event.target.value);
                  setDraftPercent(percent);
                  applyWebChatFontScale(percent);
                }}
                style={{ flex: 1, minWidth: 0 }}
              />
              <span style={{ fontSize: 21, fontWeight: 700 }}>A</span>
            </div>
            <div style={{ marginTop: 10, textAlign: 'center', fontSize: 15, fontWeight: 700 }}>{draftPercent}%</div>
            {error && <div style={{ marginTop: 10, color: '#dc2626', fontSize: 13 }}>{error}</div>}
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 18 }}>
              <button
                type="button"
                onClick={() => { setDraftPercent(100); applyWebChatFontScale(100); }}
                disabled={saving}
                style={{ ...buttonStyle, width: 'auto', padding: '0 12px' }}
              >
                По умолчанию
              </button>
              <button
                type="button"
                onClick={save}
                disabled={saving || !token}
                style={{ ...buttonStyle, width: 'auto', padding: '0 16px', borderColor: '#2563eb', background: '#2563eb', color: '#fff', opacity: saving || !token ? 0.65 : 1 }}
              >
                {saving ? 'Сохранение…' : 'Сохранить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
