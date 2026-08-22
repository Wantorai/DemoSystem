'use client';

import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ChevronDown, ExternalLink, LifeBuoy, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { AuthContext } from '../../../context/AuthContext';
import { SUPPORT_TICKETS_VIEWED_EVENT } from '../../../hooks/useUnreadSupportTickets';

const STATUS_OPTIONS = [
  { value: 'new', label: 'Новый' },
  { value: 'in_progress', label: 'В работе' },
  { value: 'done', label: 'Выполнен' },
];

const TECHNICAL_LABELS = {
  environment: 'Среда',
  browser: 'Браузер',
  system: 'Система',
  display: 'Экран',
  locale: 'Локаль',
  page: 'Страница',
  app: 'Приложение',
  device: 'Устройство',
  os: 'Операционная система',
  update: 'OTA-обновление',
  request: 'Запрос',
};

const formatTechnicalValue = (value) => {
  if (value == null || value === '') return '—';
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'boolean') return value ? 'Да' : 'Нет';
  return String(value);
};

function TechnicalInfo({ info }) {
  if (!info || typeof info !== 'object' || Object.keys(info).length === 0) return null;
  return (
    <details className="mt-3 border border-gray-200 bg-gray-50">
      <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-gray-700">
        Техническая информация
      </summary>
      <div className="space-y-3 border-t border-gray-200 p-3 text-xs">
        {Object.entries(info).map(([section, values]) => (
          <div key={section}>
            <p className="mb-1 font-semibold text-gray-700">{TECHNICAL_LABELS[section] || section}</p>
            {values && typeof values === 'object' && !Array.isArray(values) ? (
              <dl className="grid gap-x-3 gap-y-1 sm:grid-cols-[160px_minmax(0,1fr)]">
                {Object.entries(values).map(([key, value]) => (
                  <div key={key} className="contents">
                    <dt className="text-gray-500">{key}</dt>
                    <dd className="min-w-0 break-words text-gray-800">{formatTechnicalValue(value)}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="break-words text-gray-800">{formatTechnicalValue(values)}</p>
            )}
          </div>
        ))}
      </div>
    </details>
  );
}

export default function SupportTicketsAdminPage() {
  const { token } = useContext(AuthContext);
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [expandedIds, setExpandedIds] = useState(() => new Set());
  const [filter, setFilter] = useState('');
  const [error, setError] = useState('');
  const apiBase = useMemo(() => String(process.env.NEXT_PUBLIC_API_URL || '').replace(/\/$/, ''), []);

  const loadTickets = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const query = filter ? `?status=${encodeURIComponent(filter)}` : '';
      const response = await fetch(`${apiBase}/admin/support/tickets${query}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Не удалось загрузить тикеты');
      setTickets(data);
      const viewedResponse = await fetch(`${apiBase}/admin/support/tickets/mark-viewed`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ticketIds: Array.isArray(data) ? data.map((ticket) => ticket.id) : [],
        }),
      });
      if (viewedResponse.ok) {
        const viewedData = await viewedResponse.json().catch(() => ({}));
        window.dispatchEvent(new CustomEvent(SUPPORT_TICKETS_VIEWED_EVENT, {
          detail: { count: viewedData?.remainingCount || 0 },
        }));
      }
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, [apiBase, filter, token]);

  useEffect(() => {
    void loadTickets();
  }, [loadTickets]);

  const updateLocal = (id, patch) => {
    setTickets((current) => current.map((ticket) => (
      ticket.id === id ? { ...ticket, ...patch } : ticket
    )));
  };

  const toggleExpanded = (id) => {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const saveTicket = async (ticket) => {
    setSavingId(ticket.id);
    setError('');
    try {
      const response = await fetch(`${apiBase}/admin/support/tickets/${ticket.id}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: ticket.status,
          adminComment: ticket.adminComment || '',
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Не удалось сохранить тикет');
      updateLocal(ticket.id, data);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSavingId(null);
    }
  };

  const deleteTicket = async (ticket) => {
    const confirmed = window.confirm(
      `Удалить тикет #${ticket.id} «${ticket.title}»?\n\nТикет и его вложение будут удалены без возможности восстановления.`
    );
    if (!confirmed) return;

    setDeletingId(ticket.id);
    setError('');
    try {
      const response = await fetch(`${apiBase}/admin/support/tickets/${ticket.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Не удалось удалить тикет');
      setTickets((current) => current.filter((item) => item.id !== ticket.id));
      setExpandedIds((current) => {
        const next = new Set(current);
        next.delete(ticket.id);
        return next;
      });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <main className="min-h-screen bg-gray-100 px-4 py-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <LifeBuoy className="h-7 w-7 text-blue-600" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Тикеты поддержки</h1>
              <p className="text-sm text-gray-500">Обращения сотрудников из веба и мобильного приложения.</p>
            </div>
          </div>
          <button
            onClick={() => void loadTickets()}
            className="inline-flex h-10 items-center gap-2 border border-gray-300 bg-white px-3 font-medium text-gray-700 hover:bg-gray-50"
          >
            <RefreshCw className="h-4 w-4" />
            Обновить
          </button>
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          <button onClick={() => setFilter('')} className={`h-9 px-3 ${filter === '' ? 'bg-gray-900 text-white' : 'bg-white text-gray-700'}`}>Все</button>
          {STATUS_OPTIONS.map((option) => (
            <button
              key={option.value}
              onClick={() => setFilter(option.value)}
              className={`h-9 px-3 ${filter === option.value ? 'bg-blue-600 text-white' : 'bg-white text-gray-700'}`}
            >
              {option.label}
            </button>
          ))}
        </div>

        {error && <div className="mb-4 border border-red-200 bg-red-50 p-3 text-red-700">{error}</div>}
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-blue-600" /></div>
        ) : (
          <div className="space-y-3">
            {tickets.length === 0 && <div className="bg-white p-6 text-center text-gray-500">Тикетов нет.</div>}
            {tickets.map((ticket) => {
              const isExpanded = expandedIds.has(ticket.id);
              const statusLabel = STATUS_OPTIONS.find((option) => option.value === ticket.status)?.label || ticket.status;
              return (
              <article key={ticket.id} className="border border-gray-200 bg-white shadow-sm">
                <button
                  type="button"
                  onClick={() => toggleExpanded(ticket.id)}
                  aria-expanded={isExpanded}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-gray-50"
                >
                  <ChevronDown
                    className={`h-5 w-5 shrink-0 text-gray-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold text-gray-900">#{ticket.id} {ticket.title}</p>
                    <p className="truncate text-xs text-gray-500">
                      {ticket.creatorName} · {ticket.source} · {new Date(ticket.createdAt).toLocaleString('ru-RU')}
                    </p>
                  </div>
                  <span className={`shrink-0 px-2 py-1 text-xs font-semibold ${
                    ticket.status === 'done'
                      ? 'bg-emerald-100 text-emerald-800'
                      : ticket.status === 'in_progress'
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-amber-100 text-amber-800'
                  }`}>
                    {statusLabel}
                  </span>
                </button>

                {isExpanded && (
                <div className="grid gap-4 border-t border-gray-200 p-4 lg:grid-cols-[minmax(0,1fr)_240px]">
                  <div className="min-w-0">
                    <p className="whitespace-pre-wrap text-sm text-gray-800">{ticket.description}</p>
                    <TechnicalInfo info={ticket.technicalInfo} />
                    {ticket.attachmentUrl && (
                      <a
                        href={`${apiBase.replace(/\/api$/, '')}${ticket.attachmentUrl}`}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:underline"
                      >
                        <ExternalLink className="h-4 w-4" />
                        {ticket.attachmentName || 'Открыть вложение'}
                      </a>
                    )}
                  </div>

                  <div className="space-y-3">
                    <select
                      value={ticket.status}
                      onChange={(event) => updateLocal(ticket.id, { status: event.target.value })}
                      className="h-10 w-full border border-gray-300 bg-white px-2"
                    >
                      {STATUS_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                    <textarea
                      value={ticket.adminComment || ''}
                      onChange={(event) => updateLocal(ticket.id, { adminComment: event.target.value })}
                      rows={3}
                      placeholder="Комментарий сотруднику"
                      className="w-full resize-y border border-gray-300 p-2 text-sm"
                    />
                    <button
                      onClick={() => void saveTicket(ticket)}
                      disabled={savingId === ticket.id}
                      className="inline-flex h-10 w-full items-center justify-center gap-2 bg-emerald-600 px-3 font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                    >
                      {savingId === ticket.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                      Сохранить
                    </button>
                    <button
                      onClick={() => void deleteTicket(ticket)}
                      disabled={deletingId === ticket.id}
                      className="inline-flex h-10 w-full items-center justify-center gap-2 border border-red-300 bg-white px-3 font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
                    >
                      {deletingId === ticket.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      Удалить
                    </button>
                  </div>
                </div>
                )}
              </article>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
