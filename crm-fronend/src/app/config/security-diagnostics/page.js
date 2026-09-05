'use client';

import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ChevronLeft, Download, RefreshCw, ShieldAlert } from 'lucide-react';
import Spinner from '../../../components/Spinner';
import { AuthContext } from '../../../context/AuthContext';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
const EVENT_LABELS = {
  login_failed: 'Неудачный вход',
  login_rate_limited: 'Вход заблокирован лимитом',
  unexpected_origin: 'Неожиданный Origin',
};

const formatDate = (value) => {
  if (!value) return '-';
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).format(new Date(value));
};

const Metric = ({ label, value, tone = 'slate' }) => (
  <div className={`rounded border bg-white p-4 ${tone === 'red' ? 'border-red-200' : 'border-slate-200'}`}>
    <div className="text-sm text-slate-500">{label}</div>
    <div className={`mt-1 text-2xl font-semibold ${tone === 'red' ? 'text-red-700' : 'text-slate-900'}`}>{value}</div>
  </div>
);

export default function SecurityDiagnosticsPage() {
  const { token, user } = useContext(AuthContext);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [days, setDays] = useState('7');
  const [eventType, setEventType] = useState('');
  const isAdmin = [1, 2].includes(Number(user?.roleId));

  const query = useMemo(() => {
    const params = new URLSearchParams({ days, limit: '300' });
    if (eventType) params.set('eventType', eventType);
    return params.toString();
  }, [days, eventType]);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!token || !isAdmin) {
      setLoading(false);
      return;
    }
    if (silent) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const response = await fetch(`${API_URL}/security-diagnostics/summary?${query}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || `Ошибка ${response.status}`);
      setData(payload);
    } catch (requestError) {
      setError(requestError.message || 'Не удалось загрузить диагностику');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isAdmin, query, token]);

  useEffect(() => { void load(); }, [load]);

  const download = useCallback(async (format) => {
    if (!token) return;
    setRefreshing(true);
    setError('');
    try {
      const response = await fetch(`${API_URL}/security-diagnostics/export?${query}&format=${format}&limit=10000`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || `Ошибка ${response.status}`);
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `security-diagnostics-${days}d-${new Date().toISOString().slice(0, 10)}.${format}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (requestError) {
      setError(requestError.message || 'Не удалось выгрузить журнал');
    } finally {
      setRefreshing(false);
    }
  }, [days, query, token]);

  if (loading) return <Spinner />;
  if (!isAdmin) {
    return <main className="p-8 text-center text-red-700">Диагностика безопасности доступна только администраторам.</main>;
  }

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-6 text-slate-900 sm:px-6">
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Link href="/config" className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-950">
              <ChevronLeft size={16} /> Конфигурации
            </Link>
            <h1 className="mt-2 flex items-center gap-2 text-2xl font-bold"><ShieldAlert /> Диагностика безопасности</h1>
            <p className="mt-1 text-sm text-slate-500">Неудачные входы и запросы с Origin вне разрешённого списка.</p>
            <p className="mt-1 text-xs text-slate-500">Пароли, токены и тела запросов не сохраняются. Origin и IP — диагностические признаки, не доказательство атаки.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <select value={days} onChange={(event) => setDays(event.target.value)} className="h-10 rounded border border-slate-300 bg-white px-3 mt-2.5 text-sm">
              <option value="1">24 часа</option><option value="7">7 дней</option><option value="30">30 дней</option><option value="90">90 дней</option>
            </select>
            <select value={eventType} onChange={(event) => setEventType(event.target.value)} className="h-10 rounded border border-slate-300 bg-white px-3 mt-2.5 text-sm">
              <option value="">Все события</option>
              {Object.entries(EVENT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <button type="button" onClick={() => load({ silent: true })} disabled={refreshing} className="inline-flex h-10 items-center gap-2 rounded bg-slate-900 px-4 text-sm font-semibold text-white disabled:opacity-60">
              <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} /> Обновить
            </button>
            <button type="button" onClick={() => download('json')} disabled={refreshing} className="inline-flex h-10 items-center gap-2 rounded border border-slate-300 bg-white px-3 text-sm font-semibold"><Download size={16} /> JSON</button>
            <button type="button" onClick={() => download('csv')} disabled={refreshing} className="inline-flex h-10 items-center gap-2 rounded border border-slate-300 bg-white px-3 text-sm font-semibold"><Download size={16} /> CSV</button>
          </div>
        </header>

        {error && <div className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

        <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Metric label={`Событий за ${data?.range?.days || days} дн.`} value={data?.totals?.selected || 0} />
          <Metric label="Событий за 24 часа" value={data?.totals?.last24Hours || 0} />
          <Metric label="Критических в выборке" value={data?.totals?.critical || 0} tone="red" />
        </section>

        <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="rounded border border-slate-200 bg-white p-4">
            <h2 className="font-semibold">По типу</h2>
            <div className="mt-3 space-y-2 text-sm">{(data?.byType || []).map((row) => <div key={row.eventType} className="flex justify-between gap-3"><span>{EVENT_LABELS[row.eventType] || row.eventType}</span><strong>{row.count}</strong></div>)}</div>
          </div>
          <div className="rounded border border-slate-200 bg-white p-4">
            <h2 className="font-semibold">Частые IP</h2>
            <div className="mt-3 space-y-2 text-sm">{(data?.topIps || []).map((row) => <div key={row.value} className="flex justify-between gap-3"><code className="break-all">{row.value}</code><strong>{row.count}</strong></div>)}</div>
          </div>
          <div className="rounded border border-slate-200 bg-white p-4">
            <h2 className="font-semibold">Неожиданные Origin</h2>
            <div className="mt-3 space-y-2 text-sm">{(data?.topOrigins || []).map((row) => <div key={row.value} className="flex justify-between gap-3"><span className="break-all">{row.value}</span><strong>{row.count}</strong></div>)}</div>
          </div>
        </section>

        <section className="overflow-hidden rounded border border-slate-200 bg-white">
          <div className="flex items-center gap-2 border-b border-slate-200 p-4"><AlertTriangle size={18} /><h2 className="font-semibold">Последние события</h2></div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-3 py-3">Время</th><th className="px-3 py-3">Событие</th><th className="px-3 py-3">IP</th><th className="px-3 py-3">Origin / Host</th><th className="px-3 py-3">Запрос</th><th className="px-3 py-3">Логин</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {(data?.events || []).map((event) => (
                  <tr key={event.id} className="align-top">
                    <td className="whitespace-nowrap px-3 py-3">{formatDate(event.occurredAt)}</td>
                    <td className="px-3 py-3"><span className={event.severity === 'critical' ? 'font-semibold text-red-700' : 'text-amber-700'}>{EVENT_LABELS[event.eventType] || event.eventType}</span><div className="text-xs text-slate-400">HTTP {event.statusCode || '-'}</div></td>
                    <td className="px-3 py-3"><code>{event.ipAddress || '-'}</code></td>
                    <td className="max-w-xs break-all px-3 py-3">{event.origin || event.host || '-'}</td>
                    <td className="max-w-xs break-all px-3 py-3"><span className="font-medium">{event.method || '-'}</span> {event.path || '-'}</td>
                    <td className="max-w-xs break-all px-3 py-3">{event.username || '-'}</td>
                  </tr>
                ))}
                {!data?.events?.length && <tr><td colSpan={6} className="px-3 py-10 text-center text-slate-500">Событий в выбранном периоде нет.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
