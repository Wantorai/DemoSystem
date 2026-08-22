'use client';

import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clock3, ImagePlus, LifeBuoy, Loader2, Send, X } from 'lucide-react';
import { AuthContext } from '../context/AuthContext';

const STATUS_META = {
  new: { label: 'Новый', className: 'bg-amber-100 text-amber-800', icon: Clock3 },
  in_progress: { label: 'В работе', className: 'bg-blue-100 text-blue-800', icon: Loader2 },
  done: { label: 'Выполнен', className: 'bg-emerald-100 text-emerald-800', icon: CheckCircle2 },
};

const getWebTechnicalInfo = () => ({
  environment: 'web',
  browser: {
    userAgent: navigator.userAgent,
    vendor: navigator.vendor || null,
    language: navigator.language,
    languages: navigator.languages,
    cookiesEnabled: navigator.cookieEnabled,
    online: navigator.onLine,
  },
  system: {
    platform: navigator.userAgentData?.platform || navigator.platform || null,
    mobile: navigator.userAgentData?.mobile ?? null,
    hardwareConcurrency: navigator.hardwareConcurrency || null,
    deviceMemoryGb: navigator.deviceMemory || null,
  },
  display: {
    screen: `${window.screen.width}x${window.screen.height}`,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    pixelRatio: window.devicePixelRatio,
    colorDepth: window.screen.colorDepth,
  },
  locale: {
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    timezoneOffsetMinutes: new Date().getTimezoneOffset(),
  },
  page: {
    url: window.location.href,
    referrer: document.referrer || null,
  },
});

export default function SupportTicketPanel() {
  const { token, user } = useContext(AuthContext);
  const [tickets, setTickets] = useState([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [attachment, setAttachment] = useState(null);
  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [error, setError] = useState('');
  const apiBase = useMemo(
    () => String(process.env.NEXT_PUBLIC_API_URL).replace(/\/$/, ''),
    []
  );
  const supportSource = useMemo(
    () => (typeof window === 'undefined' ? 'web' : `web:${window.location.hostname}`),
    []
  );

  const loadTickets = useCallback(async () => {
    if (!token || !apiBase) return;
    setListLoading(true);
    try {
      const response = await fetch(`${apiBase}/support/tickets/my`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-support-user-name': user?.name || '',
          'x-support-source': supportSource,
        },
        cache: 'no-store',
      });
      if (!response.ok) throw new Error('Не удалось загрузить обращения');
      setTickets(await response.json());
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setListLoading(false);
    }
  }, [apiBase, supportSource, token, user?.name]);

  useEffect(() => {
    void loadTickets();
  }, [loadTickets]);

  const submit = async (event) => {
    event.preventDefault();
    if (!title.trim() || !description.trim()) {
      setError('Заполните тему и описание');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const body = new FormData();
      body.append('title', title.trim());
      body.append('description', description.trim());
      body.append('source', supportSource);
      body.append('technicalInfo', JSON.stringify(getWebTechnicalInfo()));
      if (attachment) body.append('attachment', attachment);

      const response = await fetch(`${apiBase}/support/tickets`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'x-support-user-name': user?.name || '',
          'x-support-source': supportSource,
        },
        body,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Не удалось отправить обращение');

      setTitle('');
      setDescription('');
      setAttachment(null);
      setTickets((current) => [data, ...current]);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  };

  if (!token || !user) return null;

  return (
    <section className="mx-auto mb-10 max-w-[820px] border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-3">
        <LifeBuoy className="h-6 w-6 text-blue-600" />
        <div>
          <h2 className="text-lg font-bold text-gray-900">Поддержка</h2>
          <p className="text-sm text-gray-500">Опишите проблему и приложите скриншот или видео.</p>
        </div>
      </div>

      <form onSubmit={submit} className="space-y-3">
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={200}
          placeholder="Краткая тема"
          className="h-11 w-full border border-gray-300 px-3 outline-none focus:border-blue-500"
        />
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={4}
          placeholder="Что произошло, где и что вы ожидали увидеть?"
          className="w-full resize-y border border-gray-300 px-3 py-2 outline-none focus:border-blue-500"
        />

        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex h-10 cursor-pointer items-center gap-2 border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50">
            <ImagePlus className="h-4 w-4" />
            Прикрепить
            <input
              type="file"
              accept="image/*,video/*"
              className="hidden"
              onChange={(event) => setAttachment(event.target.files?.[0] || null)}
            />
          </label>
          {attachment && (
            <button
              type="button"
              onClick={() => setAttachment(null)}
              className="inline-flex min-w-0 items-center gap-1 text-sm text-gray-600"
            >
              <span className="max-w-64 truncate">{attachment.name}</span>
              <X className="h-4 w-4" />
            </button>
          )}
          <button
            type="submit"
            disabled={loading}
            className="os-primary-bg ml-auto inline-flex h-10 items-center gap-2 px-4 font-semibold text-white disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Отправить
          </button>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>

      <div className="mt-6 border-t border-gray-200 pt-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">Мои обращения</h3>
          {listLoading && <Loader2 className="h-4 w-4 animate-spin text-gray-500" />}
        </div>
        <div className="space-y-2">
          {!listLoading && tickets.length === 0 && (
            <p className="text-sm text-gray-500">Обращений пока нет.</p>
          )}
          {tickets.map((ticket) => {
            const meta = STATUS_META[ticket.status] || STATUS_META.new;
            const StatusIcon = meta.icon;
            return (
              <article key={ticket.id} className="border border-gray-200 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-gray-900">#{ticket.id} {ticket.title}</p>
                    <p className="text-xs text-gray-500">
                      {new Date(ticket.createdAt).toLocaleString('ru-RU')}
                    </p>
                  </div>
                  <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold ${meta.className}`}>
                    <StatusIcon className="h-3.5 w-3.5" />
                    {meta.label}
                  </span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">{ticket.description}</p>
                {ticket.adminComment && (
                  <p className="mt-2 border-l-2 border-blue-400 pl-2 text-sm text-gray-700">
                    Ответ поддержки: {ticket.adminComment}
                  </p>
                )}
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
