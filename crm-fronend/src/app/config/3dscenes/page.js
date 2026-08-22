'use client';

import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AuthContext } from '../../../context/AuthContext';

const DEFAULT_RETENTION_DAYS = 60;
const RETENTION_STORAGE_KEY = 'orderspace.3dScenes.retentionDays';
const EXPIRED_DELETE_BATCH = '__expired_batch__';

function formatBytes(value) {
  const bytes = Number(value || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }

  return `${size.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function formatDate(value) {
  if (!value) return '-';
  try {
    return new Intl.DateTimeFormat('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value));
  } catch {
    return '-';
  }
}

function readRetentionDays() {
  if (typeof window === 'undefined') return DEFAULT_RETENTION_DAYS;

  const saved = Number(window.localStorage.getItem(RETENTION_STORAGE_KEY));
  if (!Number.isFinite(saved) || saved <= 0) return DEFAULT_RETENTION_DAYS;
  return Math.round(saved);
}

function getSceneAgeDays(scene) {
  const time = new Date(scene?.updatedAt || 0).getTime();
  if (!Number.isFinite(time) || time <= 0) return 0;
  return Math.max(0, Math.floor((Date.now() - time) / (24 * 60 * 60 * 1000)));
}

function isSceneExpired(scene, retentionDays) {
  const days = Number(retentionDays || DEFAULT_RETENTION_DAYS);
  if (!Number.isFinite(days) || days <= 0) return false;
  return getSceneAgeDays(scene) >= days;
}

export default function ThreeDScenesPage() {
  const { token, user, initialized } = useContext(AuthContext);
  const [scenes, setScenes] = useState([]);
  const [userFolder, setUserFolder] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState('');
  const [retentionDays, setRetentionDays] = useState(DEFAULT_RETENTION_DAYS);
  const [showExpiredPrompt, setShowExpiredPrompt] = useState(false);
  const [expiredPromptDismissed, setExpiredPromptDismissed] = useState(false);
  const [expandedScenes, setExpandedScenes] = useState({});

  const authHeaders = useMemo(() => ({
    Authorization: `Bearer ${token || ''}`,
    'Content-Type': 'application/json',
  }), [token]);

  const expiredScenes = useMemo(
    () => scenes.filter((scene) => isSceneExpired(scene, retentionDays)),
    [retentionDays, scenes]
  );

  useEffect(() => {
    setRetentionDays(readRetentionDays());
  }, []);

  useEffect(() => {
    if (!loading && expiredScenes.length > 0 && !expiredPromptDismissed) {
      setShowExpiredPrompt(true);
    }
  }, [expiredPromptDismissed, expiredScenes.length, loading]);

  const loadScenes = useCallback(async () => {
    if (!token) return;

    setLoading(true);
    setError('');
    setExpiredPromptDismissed(false);

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/3d-scenes/my`, {
        headers: authHeaders,
        cache: 'no-store',
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok || !data.ok) {
        throw new Error(data.error || `Ошибка ${response.status}`);
      }

      setScenes(Array.isArray(data.scenes) ? data.scenes : []);
      setUserFolder(data.userFolder || '');
    } catch (err) {
      setError(err.message || 'Не удалось загрузить 3D проекты');
      setScenes([]);
    } finally {
      setLoading(false);
    }
  }, [authHeaders, token]);

  useEffect(() => {
    if (initialized && token) {
      loadScenes();
    } else if (initialized && !token) {
      setLoading(false);
      setError('Нужно войти в систему');
    }
  }, [initialized, loadScenes, token]);

  const updateRetentionDays = (value) => {
    const next = Math.max(1, Math.min(3650, Math.round(Number(value) || DEFAULT_RETENTION_DAYS)));
    setRetentionDays(next);
    setExpiredPromptDismissed(false);

    if (typeof window !== 'undefined') {
      window.localStorage.setItem(RETENTION_STORAGE_KEY, String(next));
    }
  };

  const toggleScene = (sceneName) => {
    setExpandedScenes((prev) => ({ ...prev, [sceneName]: !prev[sceneName] }));
  };

  const deleteSceneRequest = async (sceneName) => {
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/3d-scenes/my/${encodeURIComponent(sceneName)}`,
      { method: 'DELETE', headers: authHeaders }
    );
    const data = await response.json().catch(() => ({}));

    if (!response.ok || !data.ok) {
      throw new Error(data.error || `Ошибка ${response.status}`);
    }
  };

  const deleteScene = async (sceneName) => {
    if (!sceneName || deleting) return;

    const approved = window.confirm(`Удалить проект "${sceneName}" со всеми файлами?`);
    if (!approved) return;

    setDeleting(sceneName);
    setError('');

    try {
      await deleteSceneRequest(sceneName);
      setScenes((prev) => prev.filter((scene) => scene.name !== sceneName));
      setShowExpiredPrompt(false);
      setExpiredPromptDismissed(true);
    } catch (err) {
      setError(err.message || 'Не удалось удалить проект');
    } finally {
      setDeleting('');
    }
  };

  const deleteExpiredSceneFromPrompt = async (sceneName) => {
    if (!sceneName || deleting) return;

    setDeleting(sceneName);
    setError('');

    try {
      await deleteSceneRequest(sceneName);
      setScenes((prev) => prev.filter((scene) => scene.name !== sceneName));
      setShowExpiredPrompt(false);
      setExpiredPromptDismissed(true);
      setShowExpiredPrompt(false);
      setExpiredPromptDismissed(true);
    } catch (err) {
      setError(err.message || 'Не удалось удалить проект');
    } finally {
      setDeleting('');
    }
  };

  const deleteExpiredScenes = async () => {
    if (expiredScenes.length === 0 || deleting) return;

    setDeleting(EXPIRED_DELETE_BATCH);
    setError('');

    try {
      const namesToDelete = expiredScenes.map((scene) => scene.name);
      for (const sceneName of namesToDelete) {
        await deleteSceneRequest(sceneName);
      }

      setScenes((prev) => prev.filter((scene) => !namesToDelete.includes(scene.name)));
      setShowExpiredPrompt(false);
      setExpiredPromptDismissed(true);
    } catch (err) {
      setError(err.message || 'Не удалось удалить просроченные проекты');
    } finally {
      setDeleting('');
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 py-8">
      <div className="mx-auto max-w-6xl px-4">
        <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Link href="/config" className="text-sm font-medium text-slate-600 hover:text-slate-900">
              Назад к конфигурациям
            </Link>
            <h1 className="mt-2 text-2xl font-bold text-slate-900">3D проекты</h1>
            <p className="mt-1 text-sm text-slate-600">
              {user?.name ? `${user.name}${userFolder ? ` · ${userFolder}` : ''}` : userFolder || 'Моя папка'}
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="text-sm font-medium text-slate-700">
              Срок хранения, дней
              <input
                type="number"
                min="1"
                max="3650"
                value={retentionDays}
                onChange={(event) => updateRetentionDays(event.target.value)}
                className="mt-1 block w-36 rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none"
              />
            </label>

            <button
              type="button"
              onClick={loadScenes}
              disabled={loading || !token}
              className="rounded bg-slate-800 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              Обновить
            </button>
          </div>
        </div>

        {expiredScenes.length > 0 && (
          <div className="mb-4 rounded border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Просрочено проектов: <strong>{expiredScenes.length}</strong>. Они подсвечены в списке.
          </div>
        )}

        {error && (
          <div className="mb-4 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}

        {loading ? (
          <div className="rounded bg-white p-6 text-slate-600 shadow">Загрузка...</div>
        ) : scenes.length === 0 ? (
          <div className="rounded bg-white p-6 text-slate-600 shadow">Проектов пока нет.</div>
        ) : (
          <div className="overflow-x-auto rounded bg-white shadow">
            <div className="grid min-w-[720px] grid-cols-[minmax(220px,1fr)_120px_160px_120px] gap-4 border-b bg-slate-50 px-4 py-3 text-xs font-semibold uppercase text-slate-500">
              <div>Проект</div>
              <div>Размер</div>
              <div>Обновлен</div>
              <div className="text-center">Действия</div>
            </div>

            <div className="divide-y">
              {scenes.map((scene) => {
                const expired = isSceneExpired(scene, retentionDays);
                const ageDays = getSceneAgeDays(scene);
                const expanded = Boolean(expandedScenes[scene.name]);

                return (
                  <div
                    key={scene.name}
                    className={`px-4 py-[0.1rem] ${expired ? 'border-l-4 border-amber-500 bg-amber-50' : 'bg-white'}`}
                  >
                    <div className="grid min-w-[720px] grid-cols-[minmax(220px,1fr)_120px_160px_120px] items-start gap-4">
                      <button
                        type="button"
                        onClick={() => toggleScene(scene.name)}
                        className="col-span-3 mt-0 grid grid-cols-subgrid text-left"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="break-all text-sm font-semibold text-slate-900">
                              {scene.name}
                            </span>
                            <span className="text-xs text-white">
                              ({scene.files?.length || 0} файлов · возраст {ageDays} дн.)
                            </span>
                            {expired && (
                              <span className="rounded bg-amber-200 px-2 py-0.5 text-xs font-semibold text-amber-900">
                                Истек срок
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="text-sm text-slate-700">{formatBytes(scene.size)}</div>
                        <div className="text-sm text-slate-700">{formatDate(scene.updatedAt)}</div>
                      </button>

                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => deleteScene(scene.name)}
                          disabled={deleting === scene.name || deleting === EXPIRED_DELETE_BATCH}
                          className="mt-0 rounded bg-red-600 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-red-300"
                        >
                          {deleting === scene.name ? 'Удаление...' : 'Удалить'}
                        </button>
                      </div>
                    </div>

                    {expanded && Array.isArray(scene.files) && scene.files.length > 0 && (
                      <div className="mt-3 overflow-hidden rounded border border-slate-200">
                        {scene.files.map((file) => (
                          <div key={file.path} className="grid grid-cols-[minmax(180px,1fr)_110px_150px] gap-3 px-3 py-2 text-xs odd:bg-slate-50">
                            <a href={file.url} target="_blank" rel="noreferrer" className="break-all text-slate-700 hover:text-blue-700">
                              {file.path}
                            </a>
                            <span className="text-slate-500">{formatBytes(file.size)}</span>
                            <span className="text-slate-500">{formatDate(file.updatedAt)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {showExpiredPrompt && expiredScenes.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4 py-6">
          <div className="max-h-[85vh] w-full max-w-2xl overflow-hidden rounded bg-white shadow-xl">
            <div className="border-b px-6 py-4">
              <h2 className="text-lg font-bold text-slate-900">Истек срок хранения</h2>
              <p className="mt-1 text-sm text-slate-600">
                Эти проекты старше {retentionDays} дней. Можно удалить их все сразу или оставить пока как есть.
              </p>
            </div>

            <div className="max-h-[50vh] overflow-y-auto px-6 py-4">
              <div className="space-y-2">
                {expiredScenes.map((scene) => (
                  <div key={scene.name} className="flex items-start justify-between gap-3 rounded border border-amber-200 bg-amber-50 px-3 py-2">
                    <div className="min-w-0">
                      <div className="break-all text-sm font-semibold text-slate-900">{scene.name}</div>
                      <div className="mt-1 text-xs text-slate-600">
                        Обновлен: {formatDate(scene.updatedAt)} · возраст {getSceneAgeDays(scene)} дн. · {formatBytes(scene.size)}
                      </div>
                    </div>
                    <button
                      type="button"
                      title="Удалить проект"
                      onClick={() => deleteExpiredSceneFromPrompt(scene.name)}
                      disabled={Boolean(deleting)}
                      className="mt-0 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded border border-red-700 bg-red-600 text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:border-red-300 disabled:bg-red-300"
                    >
                      <span className="text-lg leading-none text-white" aria-hidden="true">🗑</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-col-reverse gap-2 border-t px-6 py-4 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => { setShowExpiredPrompt(false); setExpiredPromptDismissed(true); }}
                disabled={Boolean(deleting)}
                className="mt-0 inline-flex h-10 w-full items-center justify-center rounded border border-slate-300 px-4 text-sm font-semibold leading-none text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 sm:w-36"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={deleteExpiredScenes}
                disabled={Boolean(deleting)}
                className="mt-0 inline-flex h-10 w-full items-center justify-center rounded bg-red-600 px-4 text-sm font-semibold leading-none text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-red-300 sm:w-36"
              >
                {deleting === EXPIRED_DELETE_BATCH ? 'Удаление...' : 'Удалить все'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
















