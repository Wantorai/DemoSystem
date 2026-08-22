'use client';

import React, { useContext, useRef, useState, useEffect } from 'react';
import { AuthContext } from '../context/AuthContext';
import SupportTicketPanel from '../components/SupportTicketPanel';

export default function DownloadButton() {
  const { token } = useContext(AuthContext);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(null); // null = unknown, 0..100 = percent
  const [error, setError] = useState(null);
  const abortRef = useRef(null);
  const windowsAbortRef = useRef(null);
  const isMountedRef = useRef(true);
  const [version, setVersion] = useState(null);
  const [windowsVersion, setWindowsVersion] = useState(null);
  const [windowsLoading, setWindowsLoading] = useState(false);
  const [windowsProgress, setWindowsProgress] = useState(null);
  const [windowsError, setWindowsError] = useState(null);

  //   // cleanup on unmount
  //   React.useEffect(() => {
  //     isMountedRef.current = true;
  //     return () => {
  //       isMountedRef.current = false;
  //       if (abortRef.current) {
  //         try { abortRef.current.abort(); } catch (e) {}
  //       }
  //     };
  //   }, []);

  // Получаем версию приложения
  useEffect(() => {
    const apiUrl = (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/$/, '');
    fetch(`${apiUrl}/app-version`)
      .then(r => r.json())
      .then(j => setVersion(j.version))
      .catch(() => setVersion(null));
    fetch(`${apiUrl}/filespace-desktop/version`)
      .then(r => r.json())
      .then(j => setWindowsVersion(j.version))
      .catch(() => setWindowsVersion(null));
  }, []);

  const handleDownload = async () => {
    setError(null);

    if (!token) {
      alert('Сначала войдите в систему');
      return;
    }

    setLoading(true);
    setProgress(0);

    const apiUrl = (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/$/, '');
    if (!apiUrl) {
      setError('Сервер не настроен (NEXT_PUBLIC_API_URL отсутствует)');
      setLoading(false);
      return;
    }

    const endpoint = `${apiUrl}/downloadApp?version=${encodeURIComponent(version)}`; 
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(endpoint, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        signal: controller.signal,
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => null);
        throw new Error(txt || `HTTP ${res.status}`);
      }

      // Prefer server-provided downloadable URL (if backend returns it in JSON or headers)
      // Example: if backend returns { url: "https://..." } or Content-Disposition header
      // If server returns direct file stream we fall back to streaming below.

      // Try to read content-length
      const contentLengthHeader = res.headers.get('Content-Length') || res.headers.get('content-length');
      const total = contentLengthHeader ? parseInt(contentLengthHeader, 10) : NaN;

      // If no body (unlikely) or streaming not supported — fallback to blob
      if (!res.body || typeof res.body.getReader !== 'function') {
        // non-stream fallback
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `app-${version}.apk`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
        if (isMountedRef.current) setProgress(100);
        return;
      }

      // Stream reader path — accumulate Uint8Array chunks
      const reader = res.body.getReader();
      const chunks = [];
      let received = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        // value might be Uint8Array; use .length if available else .byteLength
        const inc = (value && (value.length ?? value.byteLength)) || 0;
        received += inc;

        if (!Number.isNaN(total) && total > 0) {
          const percent = Math.round((received / total) * 100);
          if (isMountedRef.current) setProgress(percent);
        } else {
          // unknown total -> keep indeterminate (null) so UI can animate
          if (isMountedRef.current) setProgress(null);
        }
      }

      // Assemble blob and trigger download
      const blob = new Blob(chunks, { type: 'application/vnd.android.package-archive' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `app-${version}.apk`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      if (isMountedRef.current) {
        setProgress(100);
        setLoading(false);
      }
    } catch (err) {
      if (err && err.name === 'AbortError') {
        console.warn('download aborted');
      } else {
        console.error('download error', err);
        if (isMountedRef.current) setError(err.message || 'Ошибка загрузки файла');
      }
      if (isMountedRef.current) {
        setLoading(false);
        setProgress(null);
      }
    } finally {
      abortRef.current = null;
    }
  };

  const handleWindowsDownload = async () => {
    setWindowsError(null);
    if (!token) {
      alert('Сначала войдите в систему');
      return;
    }

    const apiUrl = (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/$/, '');
    if (!apiUrl) {
      setWindowsError('Сервер не настроен (NEXT_PUBLIC_API_URL отсутствует)');
      return;
    }

    const controller = new AbortController();
    windowsAbortRef.current = controller;
    setWindowsLoading(true);
    setWindowsProgress(0);

    try {
      const response = await fetch(`${apiUrl}/filespace-desktop/download`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || `HTTP ${response.status}`);
      }

      const total = Number(response.headers.get('Content-Length')) || 0;
      const chunks = [];
      let received = 0;
      if (response.body?.getReader) {
        const reader = response.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          received += value.byteLength;
          setWindowsProgress(total ? Math.round((received / total) * 100) : null);
        }
      } else {
        chunks.push(await response.arrayBuffer());
      }

      const blob = new Blob(chunks, { type: 'application/vnd.microsoft.portable-executable' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `OrderSpace-FileSpace-Setup-${windowsVersion || 'latest'}.exe`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      setWindowsProgress(100);
    } catch (downloadError) {
      if (downloadError.name !== 'AbortError') {
        console.error('windows client download error', downloadError);
        setWindowsError(downloadError.message || 'Ошибка загрузки установщика');
      }
    } finally {
      windowsAbortRef.current = null;
      setWindowsLoading(false);
    }
  };

  return (
    <>
      <div style={styles.downloadGrid}>
        <section aria-labelledby="download-title" style={styles.card}>
          <div style={styles.row}>
            <div style={styles.icon} aria-hidden>📱</div>
            <div style={styles.cardContent}>
              <h1 id="download-title" style={styles.title}>Установка мобильного приложения</h1>
              <p style={styles.subtitle}>Чаты, консультации. Скачать на телефоне и установить.</p>
              <span style={styles.version}>Build version: {version ?? 'не определена...'}</span>

              <div style={styles.controls}>
                <button
                  onClick={handleDownload}
                  disabled={loading}
                  style={{ ...styles.button, ...(loading ? styles.buttonDisabled : {}) }}
                  aria-live="polite"
                  aria-busy={loading}
                >
                  {loading ? (progress === null ? 'Скачивание…' : `Скачивание ${progress}%`) : 'Скачать приложение'}
                </button>

                {/* {progress !== null && progress >= 0 && progress <= 100 && (
                  <div style={styles.pct} aria-hidden>{progress}%</div>
                )} */}
              </div>

              {/* {loading && (
                <div style={{ marginTop: 10 }}>
                  <div style={styles.progressWrap}>
                    <div
                      style={{
                        ...styles.progressBar,
                        width: progress === null ? '100%' : `${Math.max(0, Math.min(100, progress))}%`,
                        animation: progress === null ? 'indeterminate 1.2s linear infinite' : 'none',
                      }}
                    />
                  </div>

                  <style>{`
                    @keyframes indeterminate {
                      0% { transform: translateX(-100%); }
                      50% { transform: translateX(0%); }
                      100% { transform: translateX(100%); }
                    }
                  `}</style>
                </div>
              )} */}

              {error && <div role="alert" style={styles.error}>{error}</div>}
            </div>
          </div>
        </section>

        <section aria-labelledby="windows-download-title" style={styles.card}>
          <div style={styles.row}>
            <div style={styles.icon} aria-hidden>💻</div>
            <div style={styles.cardContent}>
              <h1 id="windows-download-title" style={styles.title}>FileSpace для Windows</h1>
              <p style={styles.subtitle}>Синхронизация файлов с локальной папкой на компьютере.</p>
              <span style={styles.version}>Версия клиента: {windowsVersion ?? 'не определена...'}</span>

              <div style={styles.controls}>
                <button
                  type="button"
                  style={{ ...styles.button, ...(windowsLoading ? styles.buttonDisabled : {}) }}
                  onClick={handleWindowsDownload}
                  disabled={windowsLoading}
                  aria-live="polite"
                  aria-busy={windowsLoading}
                >
                  {windowsLoading
                    ? (windowsProgress === null ? 'Скачивание…' : `Скачивание ${windowsProgress}%`)
                    : 'Скачать для Windows'}
                </button>
                <span style={styles.platform}>Windows x64</span>
              </div>
              {windowsError && <div role="alert" style={styles.error}>{windowsError}</div>}
            </div>
          </div>
        </section>
      </div>
      <SupportTicketPanel />
    </>
  );
}

/* Inline styles */
const styles = {
  downloadGrid: {
    width: 'calc(100% - 20px)',
    maxWidth: 1180,
    margin: '10px auto',
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))',
    gap: 16,
    alignItems: 'stretch',
  },
  card: {
    minWidth: 0,
    margin: 0,
    padding: 20,
    borderRadius: 12,
    background: 'linear-gradient(180deg, #f8fbff 0%, #eef6ff 100%)',
    border: '1px solid #dbeafe',
    boxShadow: '0 8px 30px rgba(8,12,20,0.06)',
    fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial',
  },
  row: { display: 'flex', gap: 16, alignItems: 'flex-start' },
  cardContent: { flex: 1, minWidth: 0 },
  icon: { width: 56, height: 56, borderRadius: 10, background: '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0b66ff', fontSize: 24, flexShrink: 0 },
  title: { margin: 0, fontSize: 18 },
  subtitle: { marginTop: 6, marginBottom: 6, color: '#586170', fontSize: 14 },
  version: { color: '#475569', fontSize: 14 },
  controls: { display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginTop: 12 },
  button: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '10px 16px', borderRadius: 10, border: 'none', background: '#0b66ff', color: '#fff', fontWeight: 600, cursor: 'pointer', textDecoration: 'none', fontSize: 14 },
  platform: { color: '#64748b', fontSize: 13 },
  buttonDisabled: { opacity: 0.8, cursor: 'default', background: '#2563eb' },
  pct: { fontSize: 13, color: '#334155', minWidth: 36, textAlign: 'right' },
  progressWrap: { height: 8, borderRadius: 8, background: '#e6eefc', overflow: 'hidden', marginTop: 8 },
  progressBar: { height: '100%', background: 'linear-gradient(90deg,#0b66ff,#00c6ff)', transition: 'width 200ms linear' },
  error: { color: 'crimson', marginTop: 10 },
};




