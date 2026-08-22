'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';

const SOCDEP_API_URL = '/socdep-api';
const CHANNELS = [
  { key: 'telegram', label: 'Telegram', accent: '#21c7e8' },
  { key: 'max', label: 'MAX', accent: '#ff6f61' },
  { key: 'vk', label: 'VK', accent: '#4c8bf5' },
];

const emptyOverview = {
  channel: null,
  metrics: [],
  posts: [],
};

export default function SocialDeployPage() {
  const [text, setText] = useState('');
  const [files, setFiles] = useState([]);
  const [scheduledAt, setScheduledAt] = useState('');
  const [enabledChannels, setEnabledChannels] = useState({
    max: true,
    telegram: true,
    vk: true,
  });
  const [overviews, setOverviews] = useState({
    max: emptyOverview,
    telegram: emptyOverview,
    vk: emptyOverview,
  });
  const [statuses, setStatuses] = useState({
    max: 'Загрузка MAX...',
    telegram: 'Загрузка Telegram...',
    vk: 'Загрузка VK...',
  });
  const [activeOverview, setActiveOverview] = useState('telegram');
  const [editingPost, setEditingPost] = useState(null);
  const [editingText, setEditingText] = useState('');
  const [editingFiles, setEditingFiles] = useState([]);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isMutatingPost, setIsMutatingPost] = useState(false);
  const [message, setMessage] = useState('');
  const fileInputRef = useRef(null);
  const editFileInputRef = useRef(null);

  const selectedChannels = useMemo(
    () => CHANNELS.filter((channel) => enabledChannels[channel.key]),
    [enabledChannels]
  );
  const canPublish = text.trim().length > 0 || files.length > 0;

  useEffect(() => {
    refreshAllOverviews();
  }, []);

  async function refreshAllOverviews() {
    CHANNELS.forEach((channel) => loadOverview(channel.key));
  }

  async function loadOverview(channel) {
    setStatuses((current) => ({ ...current, [channel]: 'Обновление...' }));

    try {
      const response = await fetch(`${SOCDEP_API_URL}/${channel}/overview`);
      const payload = await readApiPayload(response);

      if (!response.ok) {
        throw new Error(payload.error || `Не удалось получить данные ${channel}.`);
      }

      setOverviews((current) => ({
        ...current,
        [channel]: {
          channel: payload.channel || null,
          metrics: payload.metrics || [],
          posts: normalizePosts(payload.posts || []),
        },
      }));
      setStatuses((current) => ({ ...current, [channel]: 'Данные обновлены' }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Ошибка загрузки.';
      setStatuses((current) => ({ ...current, [channel]: errorMessage }));
    }
  }

  function toggleChannel(channel) {
    setEnabledChannels((current) => ({
      ...current,
      [channel]: !current[channel],
    }));
  }

  function handleFileChange(event) {
    const pickedFiles = Array.from(event.target.files || []);
    setFiles((current) => [...current, ...pickedFiles].slice(0, 10));
    event.target.value = '';
  }

  function handleEditFileChange(event) {
    const pickedFiles = Array.from(event.target.files || []);
    setEditingFiles((current) => [...current, ...pickedFiles].slice(0, 10));
    event.target.value = '';
  }

  async function publishPost() {
    if (!canPublish) {
      setMessage('Добавьте текст, фото или видео.');
      return;
    }

    if (selectedChannels.length === 0) {
      setMessage('Выберите хотя бы одну соцсеть.');
      return;
    }

    setIsPublishing(true);
    setMessage('Публикация...');

    try {
      const results = [];

      for (const channel of selectedChannels) {
        const response = await sendPost(channel.key);
        const payload = await readApiPayload(response);

        if (!response.ok) {
          throw new Error(`${channel.label}: ${payload.error || 'не удалось опубликовать пост.'}`);
        }

        results.push(`${channel.label}: ${payload.mode === 'scheduled' ? 'scheduled' : payload.mode === 'published' ? 'published' : 'draft'}`);
      }

      setText('');
      setFiles([]);
      setScheduledAt('');
      setMessage(`Готово. ${results.join(', ')}`);
      refreshAllOverviews();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Не удалось опубликовать пост.');
    } finally {
      setIsPublishing(false);
    }
  }

  async function sendPost(channel) {
    return sendPostPayload(channel, text, files, normalizeScheduleInput(scheduledAt));
  }

  async function sendPostPayload(channel, postText, postFiles, postScheduledAt) {
    const endpoint = `${SOCDEP_API_URL}/${channel}/posts`;

    if (postFiles.length === 0) {
      return fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attachments: [], scheduledAt: postScheduledAt, text: postText }),
      });
    }

    const formData = new FormData();
    formData.append('text', postText);

    if (postScheduledAt) {
      formData.append('scheduledAt', postScheduledAt);
    }

    postFiles.forEach((file) => {
      formData.append('attachmentTypes', file.type.startsWith('video/') ? 'video' : 'image');
      formData.append('attachments', file);
    });

    return fetch(endpoint, {
      method: 'POST',
      body: formData,
    });
  }

  function openEditPost(channel, post) {
    setEditingPost({ channel, post });
    setEditingText(post.text || '');
    setEditingFiles([]);
  }

  function closeEditPost() {
    setEditingPost(null);
    setEditingText('');
    setEditingFiles([]);
  }

  async function savePostText() {
    if (!editingPost) {
      return;
    }

    const nextText = editingText.trim();

    if (!nextText) {
      setMessage('Добавьте текст для обновления поста.');
      return;
    }

    setIsMutatingPost(true);

    try {
      const response = await fetch(`${SOCDEP_API_URL}/${editingPost.channel}/posts`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messageId: editingPost.post.messageId,
          messageIds: editingPost.post.messageIds,
          text: nextText,
        }),
      });
      const payload = await readApiPayload(response);

      if (!response.ok) {
        throw new Error(payload.error || 'Не удалось обновить текст.');
      }

      setMessage('Пост обновлен.');
      closeEditPost();
      loadOverview(editingPost.channel);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Ошибка редактирования.');
    } finally {
      setIsMutatingPost(false);
    }
  }

  async function replacePostMedia() {
    if (!editingPost) {
      return;
    }

    const nextText = editingText.trim();

    if (!nextText && editingFiles.length === 0) {
      setMessage('Добавьте текст или новые вложения.');
      return;
    }

    if (editingPost.channel !== 'max' && !confirm('Будет создан новый пост, а старый удален. Продолжить?')) {
      return;
    }

    setIsMutatingPost(true);

    try {
      if (editingPost.channel === 'max') {
        const formData = buildMutationFormData(editingPost.post, nextText, editingFiles);
        const response = await fetch(`${SOCDEP_API_URL}/max/posts`, {
          method: 'PUT',
          body: formData,
        });
        const payload = await readApiPayload(response);

        if (!response.ok) {
          throw new Error(payload.error || 'Не удалось заменить медиа.');
        }

        setMessage('Медиа обновлено.');
      } else {
        const createResponse = await sendPostPayload(editingPost.channel, nextText, editingFiles);
        const createPayload = await readApiPayload(createResponse);

        if (!createResponse.ok) {
          throw new Error(createPayload.error || 'Не удалось создать новую версию поста.');
        }

        const deleteResponse = await deletePostRequest(editingPost.channel, editingPost.post);
        const deletePayload = await readApiPayload(deleteResponse);

        if (!deleteResponse.ok) {
          throw new Error(deletePayload.error || 'Новая версия создана, но старый пост не удалился.');
        }

        setMessage('Пост переопубликован.');
      }

      closeEditPost();
      loadOverview(editingPost.channel);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Ошибка замены медиа.');
    } finally {
      setIsMutatingPost(false);
    }
  }

  async function deletePost(channel, post) {
    if (!confirm('Удалить пост из канала и из SocDep?')) {
      return;
    }

    try {
      const response = await deletePostRequest(channel, post);
      const payload = await readApiPayload(response);

      if (!response.ok) {
        throw new Error(payload.error || 'Не удалось удалить пост.');
      }

      setMessage('Пост удален.');
      loadOverview(channel);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Ошибка удаления.');
    }
  }

  function deletePostRequest(channel, post) {
    return fetch(`${SOCDEP_API_URL}/${channel}/posts`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messageId: post.messageId,
        messageIds: post.messageIds,
      }),
    });
  }

  function buildMutationFormData(post, postText, postFiles) {
    const formData = new FormData();
    formData.append('text', postText);

    if (post.messageId) {
      formData.append('messageId', post.messageId);
    }

    (post.messageIds || []).forEach((messageId) => {
      formData.append('messageIds', String(messageId));
    });

    postFiles.forEach((file) => {
      formData.append('attachmentTypes', file.type.startsWith('video/') ? 'video' : 'image');
      formData.append('attachments', file);
    });

    return formData;
  }

  const activeChannelMeta = CHANNELS.find((channel) => channel.key === activeOverview) || CHANNELS[0];
  const activeData = overviews[activeOverview] || emptyOverview;

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-5">
        <section className="rounded-lg bg-slate-950 p-6 text-white shadow-lg">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-bold uppercase tracking-wide text-cyan-300">SocDep</p>
              <h1 className="m-0 text-3xl font-black">Social Deploy</h1>
              <p className="mt-2 max-w-2xl text-sm font-semibold text-slate-300">
                Единая публикация в Telegram, MAX и VK.
              </p>
            </div>
            <button
              className="m-0 rounded-md bg-white px-4 py-2 text-sm font-black text-slate-950 hover:bg-cyan-100"
              onClick={refreshAllOverviews}
              type="button"
            >
              Обновить данные
            </button>
          </div>
        </section>

        <section className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
          <div className="rounded-lg bg-white p-5 shadow">
            <h2 className="mb-4 text-xl font-black text-slate-900">Новый пост</h2>
            <textarea
              className="box-border min-h-[260px] max-w-full rounded-lg border border-slate-300 p-4 text-base text-slate-900 outline-none focus:border-cyan-500"
              onChange={(event) => setText(event.target.value)}
              placeholder="Текст публикации"
              style={{ width: 'stretch' }}
              value={text}
            />

            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-sm font-bold text-slate-500">{text.trim().length} символов</span>
              <div className="flex flex-wrap gap-2">
                {CHANNELS.map((channel) => (
                  <button
                    className={`m-0 rounded-md px-3 py-2 text-sm font-black ${
                      enabledChannels[channel.key]
                        ? 'bg-cyan-100 text-cyan-900'
                        : 'bg-slate-200 text-slate-500 hover:bg-slate-300'
                    }`}
                    key={channel.key}
                    onClick={() => toggleChannel(channel.key)}
                    type="button"
                  >
                    {channel.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <label className="block text-sm font-black text-slate-700" htmlFor="socdep-scheduled-at">
                Отложить публикацию
              </label>
              <input
                className="mt-2 box-border w-full rounded-md border border-slate-300 p-3 text-sm font-bold text-slate-900 outline-none focus:border-cyan-500"
                id="socdep-scheduled-at"
                onChange={(event) => setScheduledAt(event.target.value)}
                type="datetime-local"
                value={scheduledAt}
              />
              <p className="m-0 mt-2 text-xs font-bold text-slate-500">
                Оставьте пустым, чтобы опубликовать сразу.
              </p>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                className="m-0 rounded-md bg-slate-800 px-4 py-2 text-sm font-black text-white hover:bg-slate-700"
                onClick={() => fileInputRef.current?.click()}
                type="button"
              >
                Фото/видео
              </button>
              <button
                className="m-0 rounded-md bg-slate-200 px-4 py-2 text-sm font-black text-slate-700 hover:bg-slate-300"
                onClick={() => setFiles([])}
                type="button"
              >
                Очистить медиа
              </button>
              <input
                accept="image/*,video/*"
                className="hidden"
                multiple
                onChange={handleFileChange}
                ref={fileInputRef}
                type="file"
              />
            </div>

            {files.length > 0 && (
              <div className="mt-4 grid gap-2">
                <p className="text-sm font-black text-slate-600">{files.length} из 10 вложений</p>
                {files.map((file, index) => (
                  <div className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 p-3" key={`${file.name}-${index}`}>
                    <div>
                      <p className="m-0 text-sm font-black text-slate-900">{file.name}</p>
                      <p className="m-0 text-xs font-bold text-slate-500">{file.type || 'media'}</p>
                    </div>
                    <button
                      className="m-0 rounded bg-rose-100 px-3 py-1 text-sm font-black text-rose-700 hover:bg-rose-200"
                      onClick={() => setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                      type="button"
                    >
                      Убрать
                    </button>
                  </div>
                ))}
              </div>
            )}

            <button
              className="mt-5 w-full rounded-lg bg-cyan-500 px-5 py-4 text-base font-black text-slate-950 hover:bg-cyan-400 disabled:bg-slate-300 disabled:text-slate-500"
              disabled={!canPublish || isPublishing}
              onClick={publishPost}
              type="button"
            >
              {isPublishing ? 'Публикация...' : `Опубликовать: ${selectedChannels.map((item) => item.label).join(' + ') || 'не выбрано'}`}
            </button>

            {message && (
              <div className="mt-4 rounded-md bg-slate-100 p-3 text-sm font-bold text-slate-700">
                {message}
              </div>
            )}
          </div>

          <div className="rounded-lg bg-white p-5 shadow">
            <h2 className="mb-4 text-xl font-black text-slate-900">Каналы</h2>
            <div className="mb-4 flex flex-wrap gap-2">
              {CHANNELS.map((channel) => (
                <button
                  className={`m-0 rounded-md px-3 py-2 text-sm font-black ${
                    activeOverview === channel.key
                      ? 'bg-slate-950 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                  key={channel.key}
                  onClick={() => setActiveOverview(channel.key)}
                  type="button"
                >
                  {channel.label}
                </button>
              ))}
            </div>

            <div className="rounded-lg border border-slate-200 p-4">
              <p className="m-0 text-xs font-black uppercase" style={{ color: activeChannelMeta.accent }}>
                {activeChannelMeta.label}
              </p>
              <h3 className="m-0 mt-1 text-2xl font-black text-slate-900">
                {activeData.channel?.title || `Канал ${activeChannelMeta.label}`}
              </h3>
              <p className="m-0 mt-1 text-sm font-bold text-slate-500">
                {formatChannelSubtitle(activeData.channel, statuses[activeOverview])}
              </p>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              {(activeData.metrics || []).map((metric) => (
                <div className="rounded-lg bg-slate-950 p-4 text-white" key={metric.label}>
                  <p className="m-0 text-xs font-bold text-slate-300">{metric.label}</p>
                  <p className="m-0 mt-2 text-2xl font-black">{metric.value}</p>
                  <p className="m-0 mt-1 text-xs font-bold text-emerald-300">{metric.detail}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-lg bg-white p-5 shadow">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="m-0 text-xl font-black text-slate-900">
              Последние публикации: {activeChannelMeta.label}
            </h2>
            <span className="text-sm font-bold text-slate-500">{statuses[activeOverview]}</span>
          </div>

          {activeData.posts.length === 0 ? (
            <p className="m-0 rounded-md bg-slate-100 p-4 text-sm font-bold text-slate-500">
              Публикаций SocDep пока нет.
            </p>
          ) : (
            <div className="grid gap-3">
              {activeData.posts.map((post, index) => (
                <article className="rounded-lg border border-slate-200 p-4" key={`${post.date}-${index}`}>
                  <p className="m-0 text-base font-black text-slate-900">{post.text || 'Медиа-публикация'}</p>
                  <p className="m-0 mt-2 text-sm font-bold text-slate-500">
                    ID {formatPostIds(post)} · {formatAttachmentTypes(post.attachmentTypes || [])} · {formatDate(post.date)}
                  </p>
                  {post.views !== undefined && (
                    <p className="m-0 mt-1 text-sm font-bold text-slate-500">Просмотры: {post.views}</p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      className="m-0 rounded-md bg-cyan-100 px-3 py-2 text-sm font-black text-cyan-800 hover:bg-cyan-200"
                      onClick={() => openEditPost(activeOverview, post)}
                      type="button"
                    >
                      Изменить
                    </button>
                    <button
                      className="m-0 rounded-md bg-rose-100 px-3 py-2 text-sm font-black text-rose-700 hover:bg-rose-200"
                      onClick={() => deletePost(activeOverview, post)}
                      type="button"
                    >
                      Удалить
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        {editingPost && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4">
            <div className="max-h-[92vh] w-full max-w-2xl overflow-auto rounded-lg bg-white p-5 shadow-2xl">
              <div className="mb-4 flex items-start justify-between gap-4">
                <div>
                  <p className="m-0 text-xs font-black uppercase text-cyan-700">
                    {CHANNELS.find((channel) => channel.key === editingPost.channel)?.label}
                  </p>
                  <h2 className="m-0 mt-1 text-2xl font-black text-slate-900">Изменить пост</h2>
                </div>
                <button
                  className="m-0 rounded-md bg-slate-100 px-3 py-2 text-sm font-black text-slate-600 hover:bg-slate-200"
                  onClick={closeEditPost}
                  type="button"
                >
                  Закрыть
                </button>
              </div>

              <textarea
                className="box-border min-h-36 max-w-full rounded-lg border border-slate-300 p-4 text-base text-slate-900 outline-none focus:border-cyan-500"
                onChange={(event) => setEditingText(event.target.value)}
                placeholder="Новый текст публикации"
                style={{ width: 'stretch' }}
                value={editingText}
              />

              <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
                <h3 className="m-0 text-base font-black text-slate-900">
                  {editingPost.channel === 'max' ? 'Заменить медиа' : 'Переопубликовать с новыми медиа'}
                </h3>
                <p className="m-0 mt-1 text-sm font-bold text-slate-500">
                  {editingPost.channel === 'max'
                    ? 'MAX обновит вложения в существующем посте без удаления публикации.'
                    : 'Для Telegram и VK будет создан новый пост, а старый удален.'}
                </p>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    className="m-0 rounded-md bg-slate-800 px-4 py-2 text-sm font-black text-white hover:bg-slate-700"
                    onClick={() => editFileInputRef.current?.click()}
                    type="button"
                  >
                    Фото/видео
                  </button>
                  <button
                    className="m-0 rounded-md bg-slate-200 px-4 py-2 text-sm font-black text-slate-700 hover:bg-slate-300"
                    onClick={() => setEditingFiles([])}
                    type="button"
                  >
                    Без медиа
                  </button>
                  <input
                    accept="image/*,video/*"
                    className="hidden"
                    multiple
                    onChange={handleEditFileChange}
                    ref={editFileInputRef}
                    type="file"
                  />
                </div>

                <p className="m-0 mt-3 text-sm font-black text-slate-600">
                  Новые вложения: {editingFiles.length} из 10
                </p>
                {editingFiles.map((file, index) => (
                  <div className="mt-2 flex items-center justify-between rounded-md bg-white p-3" key={`${file.name}-${index}`}>
                    <div>
                      <p className="m-0 text-sm font-black text-slate-900">{file.name}</p>
                      <p className="m-0 text-xs font-bold text-slate-500">{file.type || 'media'}</p>
                    </div>
                    <button
                      className="m-0 rounded bg-rose-100 px-3 py-1 text-sm font-black text-rose-700 hover:bg-rose-200"
                      onClick={() => setEditingFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                      type="button"
                    >
                      Убрать
                    </button>
                  </div>
                ))}

                <button
                  className="mt-3 rounded-md bg-orange-500 px-4 py-2 text-sm font-black text-white hover:bg-orange-600 disabled:bg-slate-300"
                  disabled={isMutatingPost}
                  onClick={replacePostMedia}
                  type="button"
                >
                  {editingPost.channel === 'max' ? 'Заменить медиа' : 'Переопубликовать'}
                </button>
              </div>

              <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
                <button
                  className="m-0 rounded-md bg-slate-200 px-4 py-2 text-sm font-black text-slate-700 hover:bg-slate-300"
                  disabled={isMutatingPost}
                  onClick={closeEditPost}
                  type="button"
                >
                  Отмена
                </button>
                <button
                  className="m-0 rounded-md bg-cyan-500 px-4 py-2 text-sm font-black text-slate-950 hover:bg-cyan-400 disabled:bg-slate-300"
                  disabled={isMutatingPost}
                  onClick={savePostText}
                  type="button"
                >
                  {isMutatingPost ? 'Сохранение...' : 'Сохранить текст'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

async function readApiPayload(response) {
  const text = await response.text();

  try {
    return JSON.parse(text);
  } catch {
    return { error: 'Backend вернул не JSON.' };
  }
}

function normalizePosts(posts) {
  return posts.map((post) => ({
    ...post,
    messageIds: post.messageIds || (post.messageId ? [post.messageId] : []),
  }));
}

function normalizeScheduleInput(value) {
  if (!value) {
    return undefined;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function formatChannelSubtitle(channel, fallback) {
  if (!channel) {
    return fallback;
  }

  if (channel.username) {
    return channel.username.startsWith('@') ? channel.username : `@${channel.username}`;
  }

  if (channel.link) {
    return channel.link.replace(/^https?:\/\//, '');
  }

  return channel.type ? `Тип: ${channel.type}` : fallback;
}

function formatPostIds(post) {
  const ids = post.messageIds?.length ? post.messageIds : post.messageId ? [post.messageId] : [];
  return ids.join(', ') || 'н/д';
}

function formatAttachmentTypes(types) {
  if (!types.length) {
    return 'текст';
  }

  const imageCount = types.filter((type) => type === 'image').length;
  const videoCount = types.filter((type) => type === 'video').length;
  const parts = [];

  if (imageCount > 0) {
    parts.push(`${imageCount} фото`);
  }

  if (videoCount > 0) {
    parts.push(`${videoCount} видео`);
  }

  return parts.join(', ') || 'медиа';
}

function formatDate(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'дата неизвестна';
  }

  return date.toLocaleDateString('ru-RU', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: '2-digit',
  });
}
