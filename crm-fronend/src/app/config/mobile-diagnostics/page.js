'use client';

import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  AlertTriangle,
  Bell,
  ChevronLeft,
  Download,
  Info,
  RefreshCw,
  Server,
  Smartphone,
  Wifi,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import Spinner from '../../../components/Spinner';
import { AuthContext } from '../../../context/AuthContext';

const formatDate = (value) => {
  if (!value) return '-';
  try {
    return new Intl.DateTimeFormat('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value));
  } catch {
    return '-';
  }
};

const numberFormat = new Intl.NumberFormat('ru-RU');
const metricFormat = (value, suffix = '') => (value == null ? '-' : `${numberFormat.format(value)}${suffix}`);
const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

const HelpLabel = ({ children, tip, className = '' }) => (
  <span className={`inline-flex items-center gap-1.5 ${className}`} title={tip}>
    <span>{children}</span>
    {tip ? (
      <Info
        size={14}
        className="shrink-0 rounded-full text-slate-400 hover:text-slate-700"
        aria-label={tip}
      />
    ) : null}
  </span>
);

const Th = ({ children, tip }) => (
  <th className="px-4 py-3">
    <HelpLabel tip={tip}>{children}</HelpLabel>
  </th>
);

const Metric = ({ icon: Icon, label, value, sub, tip }) => (
  <div className="rounded border border-slate-200 bg-white p-4" title={tip}>
    <div className="flex items-start gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-slate-100 text-slate-700">
        <Icon size={18} />
      </div>
      <div className="min-w-0">
        <div className="text-sm text-slate-500">
          <HelpLabel tip={tip}>{label}</HelpLabel>
        </div>
        <div className="mt-1 text-2xl font-semibold text-slate-900">{value}</div>
        {sub ? <div className="mt-1 text-xs text-slate-500">{sub}</div> : null}
      </div>
    </div>
  </div>
);

const statusClass = (statusCode) => {
  const code = Number(statusCode || 0);
  if (code >= 500) return 'bg-red-100 text-red-700';
  if (code >= 400) return 'bg-amber-100 text-amber-700';
  if (code === 204) return 'bg-slate-100 text-slate-600';
  return 'bg-emerald-100 text-emerald-700';
};

const compactList = (items, formatter) => {
  if (!items?.length) return '-';
  return items.map(formatter).join(', ');
};

const compactObject = (value, limit = 3) => {
  if (!value || typeof value !== 'object') return '-';
  const entries = Object.entries(value)
    .filter(([, count]) => Number(count || 0) > 0)
    .sort((a, b) => Number(b[1] || 0) - Number(a[1] || 0));
  if (!entries.length) return '-';
  return entries.slice(0, limit).map(([key, count]) => `${key}: ${numberFormat.format(Number(count || 0))}`).join(', ');
};

const networkFlags = (row) => {
  const flags = [];
  if (Number(row.disconnectedCount || 0) > 0) flags.push(`offline: ${numberFormat.format(row.disconnectedCount)}`);
  if (Number(row.unreachableCount || 0) > 0) flags.push(`no-internet: ${numberFormat.format(row.unreachableCount)}`);
  if (Number(row.expensiveConnectionCount || 0) > 0) flags.push(`expensive: ${numberFormat.format(row.expensiveConnectionCount)}`);
  return flags.length ? flags.join(', ') : '-';
};

const backgroundRequestFlags = (row) => {
  const flags = [];
  if (Number(row.apiStartedInBackgroundCount || 0) > 0) {
    flags.push(`started-bg: ${numberFormat.format(row.apiStartedInBackgroundCount)}`);
  }
  if (Number(row.apiBackgroundedDuringRequestCount || 0) > 0) {
    flags.push(`bg-during: ${numberFormat.format(row.apiBackgroundedDuringRequestCount)}`);
  }
  if (Number(row.apiAppStateChangedDuringRequestCount || 0) > 0) {
    flags.push(`state-change: ${numberFormat.format(row.apiAppStateChangedDuringRequestCount)}`);
  }
  return flags.length ? flags.join(', ') : '-';
};

const backendDebugText = (backend) => {
  if (!backend) return 'pid=-; route=-';
  return [
    `pid=${backend.pid || '-'}`,
    `route=${backend.routeStartedAt || '-'}`,
    `role=${backend.roleId ?? '-'}`,
    `host=${backend.normalizedHost || '-'}`,
    `hostOk=${backend.isAllowedHost ?? '-'}`,
    `admin=${backend.isAdmin ?? '-'}`,
    `active=${backend.isActiveUser ?? '-'}`,
  ].join('; ');
};

export default function MobileDiagnosticsPage() {
  const { token } = useContext(AuthContext);
  const [data, setData] = useState(null);
  const [history, setHistory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [debugMessage, setDebugMessage] = useState('');

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!token) return;
    if (silent) setRefreshing(true);
    else setLoading(true);
    setError('');

    try {
      const res = await fetch(`${API_URL}/mobile-diagnostics/summary`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        cache: 'no-store',
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error || `Ошибка ${res.status}`);
      setData(payload);
    } catch (err) {
      setError(err.message || 'Не удалось загрузить диагностику');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!token) return undefined;
    const id = window.setInterval(() => load({ silent: true }), 30000);
    return () => window.clearInterval(id);
  }, [load, token]);

  const checkBackend = useCallback(async () => {
    if (!token) return;
    setRefreshing(true);
    setError('');
    setDebugMessage('');
    try {
      const url = `${API_URL}/mobile-diagnostics/summary`;
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        cache: 'no-store',
      });
      const text = await res.text();
      let payload = {};
      try {
        payload = text ? JSON.parse(text) : {};
      } catch {
        payload = { raw: text };
      }
      setDebugMessage(`GET ${url} -> ${res.status}; ${backendDebugText(payload?.backend)}`);
      if (!res.ok) throw new Error(payload?.error || payload?.raw || `Ошибка ${res.status}`);
      setData(payload);
    } catch (err) {
      setError(err.message || 'Не удалось проверить backend');
    } finally {
      setRefreshing(false);
    }
  }, [token]);

  const loadHistory = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_URL}/mobile-diagnostics/history?days=7&bucket=day`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        cache: 'no-store',
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error || `Ошибка ${res.status}`);
      setHistory(payload);
    } catch (err) {
      setError(err.message || 'Не удалось загрузить историю диагностики');
    }
  }, [token]);

  const downloadExport = useCallback(async ({ days = 7, bucket, minDiagVersion = 0, exportVersion = 0 } = {}) => {
    if (!token) return;
    setRefreshing(true);
    setError('');
    try {
      const normalizedDays = Math.min(Math.max(Number.parseInt(String(days), 10) || 7, 1), 30);
      const normalizedBucket = bucket || (normalizedDays <= 2 ? 'hour' : 'day');
      const params = new URLSearchParams({ days: String(normalizedDays), bucket: normalizedBucket });
      if (minDiagVersion) params.set('minDiagVersion', String(minDiagVersion));
      if (exportVersion) params.set('exportVersion', String(exportVersion));
      const res = await fetch(`${API_URL}/mobile-diagnostics/export?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        cache: 'no-store',
      });
      if (!res.ok) {
        let payload = {};
        try {
          payload = await res.json();
        } catch {
          payload = {};
        }
        throw new Error(payload?.error || `Ошибка ${res.status}`);
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const versionSuffix = exportVersion || minDiagVersion;
      a.download = `mobile-diagnostics-${normalizedDays}d${versionSuffix ? `-diag${versionSuffix}` : ''}-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message || 'Не удалось выгрузить диагностику');
    } finally {
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const updateClientsCount = data?.updateClients?.clients?.length || 0;
  const runtimeCount = useMemo(
    () => (data?.updateClients?.clients || []).reduce((sum, client) => sum + (client.runtimes?.length || 0), 0),
    [data]
  );
  const telemetryApps = data?.telemetry?.byApp || [];
  const slowApiEndpoints = data?.telemetry?.slowApiEndpoints || [];
  const backendSlowEndpoints = data?.apiPerformance?.endpoints || [];
  const telemetryChartData = telemetryApps.map((app) => ({
    appKey: app.appKey,
    activeDevices: app.activeDevices5m,
    errors: app.errors1h,
    api: app.avgApiLatencyMs || 0,
  }));
  const historyChartData = (history?.buckets || []).map((bucket) => ({
    ...bucket,
    label: new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit' }).format(new Date(bucket.bucket)),
  }));
  const compare = history?.compare || {};
  const delta = (current, previous) => {
    const a = Number(current || 0);
    const b = Number(previous || 0);
    return a - b;
  };

  if (loading) return <Spinner />;

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-6 text-slate-900 sm:px-6">
      <div className="mx-auto max-w-7xl space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link href="/config" className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-950">
              <ChevronLeft size={16} />
              Конфигурации
            </Link>
            <h1 className="mt-2 text-2xl font-bold">Диагностика мобильных приложений</h1>
            <div className="mt-1 text-sm text-slate-500">Обновлено: {formatDate(data?.generatedAt)}</div>
            <div className="mt-1 break-all text-xs text-slate-500">API: {API_URL || 'NEXT_PUBLIC_API_URL не задан'}</div>
            {data?.backend ? (
              <div className="mt-1 text-xs text-slate-500">
                Backend PID: {data.backend.pid || '-'}, route: {formatDate(data.backend.routeStartedAt)}, внешний ingest: {data.backend.externalIngestEnabled ? 'включен' : 'выключен'}
              </div>
            ) : null}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => load({ silent: true })}
              disabled={refreshing}
              className="inline-flex h-10 items-center justify-center gap-2 rounded bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-60"
            >
              <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
              Обновить
            </button>
            <button
              type="button"
              onClick={checkBackend}
              disabled={refreshing}
              className="inline-flex h-10 items-center justify-center gap-2 rounded border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 disabled:opacity-60"
            >
              <Server size={16} />
              Проверить backend
            </button>
            <button
              type="button"
              onClick={() => downloadExport({ days: 7, bucket: 'day' })}
              disabled={refreshing}
              className="inline-flex h-10 items-center justify-center gap-2 rounded border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 disabled:opacity-60"
              title="Скачать агрегированную диагностику за 7 дней в JSON"
            >
              <Download size={16} />
              Экспорт 7д
            </button>
            <button
              type="button"
              onClick={() => downloadExport({ days: 7, bucket: 'day', minDiagVersion: 5 })}
              disabled={refreshing}
              className="inline-flex h-10 items-center justify-center gap-2 rounded border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 disabled:opacity-60"
              title="Скачать агрегированную диагностику за 7 дней только по свежим событиям Diag 5+"
            >
              <Download size={16} />
              Diag 5
            </button>
            <button
              type="button"
              onClick={() => downloadExport({ days: 1, bucket: 'hour', minDiagVersion: 5 })}
              disabled={refreshing}
              className="inline-flex h-10 items-center justify-center gap-2 rounded border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 disabled:opacity-60"
              title="Скачать диагностику за последние 24 часа только по свежим событиям Diag 5+"
            >
              <Download size={16} />
              Diag 5 1д
            </button>
            <button
              type="button"
              onClick={() => downloadExport({ days: 1, bucket: 'hour', minDiagVersion: 6 })}
              disabled={refreshing}
              className="inline-flex h-10 items-center justify-center gap-2 rounded border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 disabled:opacity-60"
              title="Скачать диагностику за последние 24 часа только по событиям Diag 6+ с сетевым контекстом"
            >
              <Download size={16} />
              Diag 6 1д
            </button>
            <button
              type="button"
              onClick={() => downloadExport({ days: 1, bucket: 'hour', minDiagVersion: 7 })}
              disabled={refreshing}
              className="inline-flex h-10 items-center justify-center gap-2 rounded border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 disabled:opacity-60"
              title="Скачать диагностику за последние 24 часа только по событиям Diag 7+ с подробными socket reconnect событиями"
            >
              <Download size={16} />
              Diag 7 1д
            </button>
            <button
              type="button"
              onClick={() => downloadExport({ days: 1, bucket: 'hour', minDiagVersion: 8 })}
              disabled={refreshing}
              className="inline-flex h-10 items-center justify-center gap-2 rounded border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 disabled:opacity-60"
              title="Скачать диагностику за последние 24 часа только по событиям Diag 8+ с признаками background/resume"
            >
              <Download size={16} />
              Diag 8 1д
            </button>
            <button
              type="button"
              onClick={() => downloadExport({ days: 1, bucket: 'hour', minDiagVersion: 8, exportVersion: 9 })}
              disabled={refreshing}
              className="inline-flex h-10 items-center justify-center gap-2 rounded border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 disabled:opacity-60"
              title="Скачать диагностику за последние 24 часа с разрезами all/activeOnly по Wi-Fi, cellular, carrier и endpoint. Поля добавлены в export как Diag 9, мобильный билд не нужен."
            >
              <Download size={16} />
              Diag 9 1д
            </button>
          </div>
        </div>

        {error ? (
          <div className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
        ) : null}
        {debugMessage ? (
          <div className="rounded border border-slate-200 bg-white p-4 text-sm text-slate-700">{debugMessage}</div>
        ) : null}

        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric
            icon={Wifi}
            label="Пользователи онлайн"
            value={numberFormat.format(data?.sockets?.onlineUsers || 0)}
            sub={`${numberFormat.format(data?.sockets?.socketConnections || 0)} socket-подключений`}
            tip="Текущее количество пользователей и socket-подключений на этом backend-процессе. Это состояние сейчас, не история."
          />
          <Metric
            icon={Smartphone}
            label="Мобильные клиенты"
            value={numberFormat.format(updateClientsCount)}
            sub={`${numberFormat.format(runtimeCount)} runtime-версий опубликовано`}
            tip="Клиенты, для которых на backend опубликованы OTA/runtime-версии."
          />
          <Metric
            icon={Bell}
            label="Push"
            value={numberFormat.format(data?.push?.expoTokens || 0)}
            sub={`${numberFormat.format(data?.push?.unifiedEnabled || 0)} UnifiedPush активных`}
            tip="Количество push-токенов и активных UnifiedPush-подписок в базе."
          />
          <Metric
            icon={Activity}
            label="OTA за сессию бэка"
            value={numberFormat.format(data?.ota?.recent?.length || 0)}
            sub={`${numberFormat.format((data?.ota?.byApp || []).reduce((sum, row) => sum + row.errors, 0))} ошибок`}
            tip="OTA-запросы, которые видел текущий backend-процесс после последнего запуска. После рестарта счетчик обнуляется."
          />
        </section>

        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric
            icon={Smartphone}
            label="Активные устройства"
            value={numberFormat.format(data?.telemetry?.activeDevices5m || 0)}
            sub={`${numberFormat.format(data?.telemetry?.devices24h || 0)} устройств за 24 часа`}
            tip="Уникальные deviceId, от которых пришли события за последние 5 минут."
          />
          <Metric
            icon={Activity}
            label="API latency"
            value={metricFormat(data?.telemetry?.avgApiLatencyMs, ' мс')}
            sub={`p95: ${metricFormat(data?.telemetry?.p95ApiLatencyMs, ' мс')}`}
            tip="Полное время API-запросов на мобильном устройстве. p95 значит, что 95% запросов были быстрее этого значения."
          />
          <Metric
            icon={Wifi}
            label="Socket reconnect"
            value={metricFormat(data?.telemetry?.avgSocketLatencyMs, ' мс')}
            sub={`${numberFormat.format(data?.telemetry?.socketReconnects1h || 0)} reconnect-событий за час`}
            tip="Среднее время между socket-disconnected и следующим socket-connected. Это не ping, а длительность разрыва."
          />
          <Metric
            icon={AlertTriangle}
            label="Проблемы за час"
            value={numberFormat.format((data?.telemetry?.errors1h || 0) + (data?.telemetry?.warnings1h || 0))}
            sub={`${numberFormat.format(data?.telemetry?.errors1h || 0)} критичных`}
            tip="Warning и critical события от мобильных приложений за последний час."
          />
        </section>

        <section className="rounded border border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="font-semibold">
              <HelpLabel tip="Показывает, доходят ли мобильные диагностические события до backend и центрального orderspace ingest.">
                Прием метрик
              </HelpLabel>
            </h2>
            <span className={data?.ingest?.lastError ? 'text-sm font-semibold text-red-600' : 'text-sm font-semibold text-emerald-700'}>
              {data?.ingest?.lastError ? 'есть ошибка' : 'готов'}
            </span>
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm md:grid-cols-4">
            <dt className="text-slate-500">Попытки</dt>
            <dd className="font-semibold">{numberFormat.format(data?.ingest?.attempts || 0)}</dd>
            <dt className="text-slate-500">Принято</dt>
            <dd className="font-semibold">{numberFormat.format(data?.ingest?.accepted || 0)}</dd>
            <dt className="text-slate-500">Ошибки</dt>
            <dd className="font-semibold">{numberFormat.format(data?.ingest?.failed || 0)}</dd>
            <dt className="text-slate-500">Таблица</dt>
            <dd className="font-semibold">{data?.ingest?.tableReady ? 'готова' : 'не проверялась'}</dd>
            <dt className="text-slate-500">Последняя метрика</dt>
            <dd className="font-semibold">{formatDate(data?.ingest?.lastAcceptedAt)}</dd>
            <dt className="text-slate-500">Последняя ошибка</dt>
            <dd className="font-semibold">{data?.ingest?.lastError || '-'}</dd>
            <dt className="text-slate-500">Relay попытки</dt>
            <dd className="font-semibold">{numberFormat.format(data?.relay?.attempts || 0)}</dd>
            <dt className="text-slate-500">Relay принято центром</dt>
            <dd className="font-semibold">{numberFormat.format(data?.relay?.forwarded || 0)}</dd>
            <dt className="text-slate-500">Relay ошибка</dt>
            <dd className="font-semibold">{data?.relay?.lastError || '-'}</dd>
          </dl>
        </section>

        {data?.alerts?.length ? (
          <section className="rounded border border-amber-200 bg-amber-50 p-4">
            <div className="mb-3 flex items-center gap-2 font-semibold text-amber-900">
              <AlertTriangle size={18} />
              Предупреждения
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              {data.alerts.map((alert, index) => (
                <div key={`${alert.title}-${index}`} className="rounded border border-amber-200 bg-white p-3 text-sm">
                  <div className="font-semibold text-slate-900">{alert.title}</div>
                  <div className="mt-1 text-slate-600">{alert.details}</div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <section className="rounded border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <h2 className="font-semibold">
              <HelpLabel tip="Дневная история мобильных событий, устройств, ошибок и средней API latency. Нужна для сравнения с вчера и поиска пиков.">
                История за 7 дней
              </HelpLabel>
            </h2>
            <button
              type="button"
              onClick={loadHistory}
              className="inline-flex h-8 items-center justify-center gap-2 rounded border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-800 transition hover:bg-slate-50"
            >
              <RefreshCw size={14} />
              История
            </button>
          </div>
          <div className="grid gap-4 p-4 xl:grid-cols-[1fr_320px]">
            <div className="h-80">
              {historyChartData.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={historyChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                    <YAxis yAxisId="left" tick={{ fontSize: 12 }} allowDecimals={false} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} allowDecimals={false} />
                    <Tooltip />
                    <Legend />
                    <Line yAxisId="left" type="monotone" dataKey="devices" name="Устройства" stroke="#2563eb" strokeWidth={2} dot={false} />
                    <Line yAxisId="left" type="monotone" dataKey="errors" name="Ошибки" stroke="#dc2626" strokeWidth={2} dot={false} />
                    <Line yAxisId="right" type="monotone" dataKey="avgApiLatencyMs" name="API avg, мс" stroke="#059669" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center rounded border border-dashed border-slate-300 text-sm text-slate-500">
                  История появится после поступления мобильных метрик
                </div>
              )}
            </div>
            <div className="rounded border border-slate-200 p-4">
              <h3 className="mb-3 font-semibold">
                <HelpLabel tip="Разница текущего дня с предыдущим днем по событиям, устройствам, ошибкам и API latency.">
                  Сегодня / вчера
                </HelpLabel>
              </h3>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <dt className="text-slate-500">События</dt>
                <dd className="text-right font-semibold">
                  {numberFormat.format(compare.today?.events || 0)}
                  <span className="ml-2 text-xs text-slate-500">({delta(compare.today?.events, compare.yesterday?.events) >= 0 ? '+' : ''}{numberFormat.format(delta(compare.today?.events, compare.yesterday?.events))})</span>
                </dd>
                <dt className="text-slate-500">Устройства</dt>
                <dd className="text-right font-semibold">
                  {numberFormat.format(compare.today?.devices || 0)}
                  <span className="ml-2 text-xs text-slate-500">({delta(compare.today?.devices, compare.yesterday?.devices) >= 0 ? '+' : ''}{numberFormat.format(delta(compare.today?.devices, compare.yesterday?.devices))})</span>
                </dd>
                <dt className="text-slate-500">Ошибки</dt>
                <dd className="text-right font-semibold text-red-600">
                  {numberFormat.format(compare.today?.errors || 0)}
                  <span className="ml-2 text-xs text-slate-500">({delta(compare.today?.errors, compare.yesterday?.errors) >= 0 ? '+' : ''}{numberFormat.format(delta(compare.today?.errors, compare.yesterday?.errors))})</span>
                </dd>
                <dt className="text-slate-500">API avg</dt>
                <dd className="text-right font-semibold">{metricFormat(compare.today?.avgApiLatencyMs, ' мс')}</dd>
              </dl>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-5 xl:grid-cols-[1.4fr_1fr]">
          <div className="rounded border border-slate-200 bg-white xl:col-span-2">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <h2 className="font-semibold">
                <HelpLabel tip="Сводка по каждому мобильному клиенту за последний час: активность, версия диагностики, задержки, FPS, память и ошибки.">
                  Метрики по приложениям
                </HelpLabel>
              </h2>
              <Activity size={18} className="text-slate-500" />
            </div>
            <div className="grid gap-4 p-4 xl:grid-cols-[1fr_1.2fr]">
              <div className="h-72">
                {telemetryChartData.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={telemetryChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="appKey" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="activeDevices" name="Активные устройства" fill="#2563eb" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="errors" name="Ошибки за час" fill="#dc2626" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center rounded border border-dashed border-slate-300 text-sm text-slate-500">
                    Мобильные метрики еще не поступали. Проверьте кнопку тестовой метрики и наличие свежего OTA/build в приложении.
                  </div>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                      <Th tip="appKey мобильного приложения: orderspace, buhfinance и другие клиенты.">Клиент</Th>
                      <Th tip="Версия диагностической схемы. 3 означает, что приложение умеет отправлять server-duration и in-flight поля.">Diag</Th>
                      <Th tip="Уникальные устройства, приславшие события за последние 5 минут.">Устройства 5м</Th>
                      <Th tip="Все диагностические события от клиента за последний час.">События 1ч</Th>
                      <Th tip="Среднее полное время API-запроса на мобильном устройстве за час.">API avg</Th>
                      <Th tip="95-й процентиль API latency: 95% запросов быстрее этого значения. Лучше смотреть вместе с avg.">API p95</Th>
                      <Th tip="Средний FPS, если мобильное приложение присылает эту метрику. Пусто значит, что данных нет.">FPS</Th>
                      <Th tip="Средняя память приложения в MB, если мобильное приложение присылает эту метрику.">Память</Th>
                      <Th tip="Critical/error события за последний час. Warning считаются отдельно в проблемах.">Ошибки</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {telemetryApps.map((app) => (
                      <tr key={app.appKey}>
                        <td className="px-4 py-3 font-semibold">{app.appKey}</td>
                        <td className="px-4 py-3">{app.diagnosticsVersions?.length ? app.diagnosticsVersions.join(', ') : '-'}</td>
                        <td className="px-4 py-3">{numberFormat.format(app.activeDevices5m || 0)}</td>
                        <td className="px-4 py-3">{numberFormat.format(app.events1h || 0)}</td>
                        <td className="px-4 py-3">{metricFormat(app.avgApiLatencyMs, ' мс')}</td>
                        <td className="px-4 py-3">{metricFormat(app.p95ApiLatencyMs, ' мс')}</td>
                        <td className="px-4 py-3">{metricFormat(app.avgFps)}</td>
                        <td className="px-4 py-3">{metricFormat(app.avgMemoryMb, ' MB')}</td>
                        <td className="px-4 py-3">
                          <span className={app.errors1h ? 'font-semibold text-red-600' : 'text-slate-500'}>
                            {numberFormat.format(app.errors1h || 0)}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {!telemetryApps.length ? (
                      <tr>
                        <td className="px-4 py-6 text-slate-500" colSpan={9}>
                          Данных от мобильных приложений пока нет
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="rounded border border-slate-200 bg-white xl:col-span-2">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <h2 className="font-semibold">
                <HelpLabel tip="Медленные API глазами мобильного приложения. Здесь видно полное клиентское время, серверное время handler и разницу между ними.">
                  Самые медленные API
                </HelpLabel>
              </h2>
              <Activity size={18} className="text-slate-500" />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1740px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <Th tip="Какое мобильное приложение прислало медленные события.">Клиент</Th>
                    <Th tip="Версии диагностической схемы в событиях этого endpoint. Если есть 5, новые события уже с лимитером и исправленным maxInFlight.">Diag</Th>
                    <Th tip="HTTP method + путь API без домена. Числовые id в backend-сопоставлении могут нормализоваться.">Endpoint</Th>
                    <Th tip="Сколько медленных событий попало в эту группу за последний час.">События</Th>
                    <Th tip="Среднее полное время запроса на устройстве: сеть, прокси, ожидание, backend и получение ответа.">Client avg</Th>
                    <Th tip="95-й процентиль полного клиентского времени. Хорошо показывает хвосты задержек.">Client p95</Th>
                    <Th tip="Средняя длительность backend handler из заголовка x-api-duration-ms или backend snapshot.">Server avg</Th>
                    <Th tip="95-й процентиль длительности backend handler. Если он маленький, handler обычно не узкое место.">Server p95</Th>
                    <Th tip="Сколько событий реально имели server-duration. Если 0, приложение еще не прислало новые поля или endpoint не сопоставился.">Server samples</Th>
                    <Th tip="Средняя разница Client total - Server handler. Большое значение означает задержку вне handler: сеть, очередь, прокси или клиент.">Overhead avg</Th>
                    <Th tip="Среднее количество активных API-запросов в приложении в момент старта медленного запроса. Требует Diag 3+.">In-flight avg</Th>
                    <Th tip="Максимальный параллелизм API-запросов на устройстве. После лимитера должен быть около 8, а не десятки. Требует Diag 3+.">In-flight max</Th>
                    <Th tip="Сколько запрос в среднем ждал клиентского лимитера перед отправкой в сеть. Требует Diag 4.">Queue avg</Th>
                    <Th tip="Тип сети по NetInfo в медленных событиях: wifi, cellular, none, unknown. Требует Diag 6 для точных данных.">Network</Th>
                    <Th tip="Состояние приложения во время события: active, background или inactive. Требует Diag 6 для точных данных.">App state</Th>
                    <Th tip="Diag 8: сколько медленных запросов стартовали в фоне, пережили background/inactive или смену AppState. Такие задержки часто не являются реальным ожиданием пользователя.">Bg req</Th>
                    <Th tip="Флаги проблем сети: offline = isConnected=false, no-internet = isInternetReachable=false, expensive = дорогая/мобильная сеть по NetInfo.">Net flags</Th>
                    <Th tip="mobile-header: server-duration пришел прямо с мобильного события. backend-session: сопоставлено с in-memory backend статистикой.">Server source</Th>
                    <Th tip="Самый медленный клиентский замер в группе.">Client max</Th>
                    <Th tip="Сколько уникальных устройств прислали события для этого endpoint.">Устройства</Th>
                    <Th tip="HTTP статусы ответов, которые видело мобильное приложение. 304 тоже нормальный ответ кеширования.">Статусы</Th>
                    <Th tip="Когда последний раз был зафиксирован медленный запрос в этой группе.">Последний раз</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {slowApiEndpoints.map((row) => (
                    <tr key={`${row.appKey}-${row.method}-${row.path}`}>
                      <td className="px-4 py-3 font-semibold">{row.appKey || '-'}</td>
                      <td className="px-4 py-3">{row.diagnosticsVersions?.length ? row.diagnosticsVersions.join(', ') : '-'}</td>
                      <td className="max-w-[360px] truncate px-4 py-3 font-mono text-xs">
                        {row.method} {row.path}
                      </td>
                      <td className="px-4 py-3">{numberFormat.format(row.count || 0)}</td>
                      <td className="px-4 py-3">{metricFormat(row.avgLatencyMs, ' мс')}</td>
                      <td className="px-4 py-3 font-semibold text-amber-700">{metricFormat(row.p95LatencyMs, ' мс')}</td>
                      <td className="px-4 py-3">{metricFormat(row.avgServerDurationMs, ' мс')}</td>
                      <td className="px-4 py-3">{metricFormat(row.p95ServerDurationMs, ' мс')}</td>
                      <td className="px-4 py-3">{numberFormat.format(row.serverSamples || 0)}</td>
                      <td className="px-4 py-3">{metricFormat(row.avgClientOverheadMs, ' мс')}</td>
                      <td className="px-4 py-3">{metricFormat(row.avgInFlightAtStart)}</td>
                      <td className="px-4 py-3">{metricFormat(row.maxInFlight)}</td>
                      <td className="px-4 py-3">{metricFormat(row.avgQueueWaitMs, ' мс')}</td>
                      <td className="max-w-[180px] truncate px-4 py-3 text-xs" title={compactObject(row.networkTypes, 8)}>
                        {compactObject(row.networkTypes)}
                      </td>
                      <td className="max-w-[160px] truncate px-4 py-3 text-xs" title={compactObject(row.appStates, 8)}>
                        {compactObject(row.appStates)}
                      </td>
                      <td className="max-w-[220px] truncate px-4 py-3 text-xs" title={backgroundRequestFlags(row)}>
                        {backgroundRequestFlags(row)}
                      </td>
                      <td className="max-w-[220px] truncate px-4 py-3 text-xs" title={networkFlags(row)}>
                        {networkFlags(row)}
                      </td>
                      <td className="px-4 py-3">{row.serverDurationSource || '-'}</td>
                      <td className="px-4 py-3">{metricFormat(row.maxLatencyMs, ' мс')}</td>
                      <td className="px-4 py-3">{numberFormat.format(row.devices || 0)}</td>
                      <td className="px-4 py-3">{row.statuses?.length ? row.statuses.join(', ') : '-'}</td>
                      <td className="px-4 py-3">{formatDate(row.lastSeenAt)}</td>
                    </tr>
                  ))}
                  {!slowApiEndpoints.length ? (
                    <tr>
                      <td className="px-4 py-6 text-slate-500" colSpan={22}>
                        Медленных API-событий за последний час нет
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded border border-slate-200 bg-white xl:col-span-2">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <h2 className="font-semibold">
                <HelpLabel tip="Медленные /api запросы, измеренные самим backend-процессом. Это in-memory статистика и она очищается после рестарта backend.">
                  Медленные backend handlers
                </HelpLabel>
              </h2>
              <Server size={18} className="text-slate-500" />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1080px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <Th tip="Нормализованный backend route, который сам backend измерил как медленный.">Endpoint</Th>
                    <Th tip="Количество медленных backend-запросов в текущей сессии процесса.">События</Th>
                    <Th tip="Средняя длительность handler на backend.">Avg</Th>
                    <Th tip="95-й процентиль длительности handler.">p95</Th>
                    <Th tip="Самый медленный handler в этой группе.">Max</Th>
                    <Th tip="Количество уникальных пользователей, если backend смог определить userId.">Пользователи</Th>
                    <Th tip="Группировка по user-agent: mobile, web, other или unknown.">Источник</Th>
                    <Th tip="HTTP статусы, которые вернул backend.">Статусы</Th>
                    <Th tip="Самый частый user-agent для endpoint. okhttp обычно означает Android/mobile.">User-Agent</Th>
                    <Th tip="Последний медленный backend handler в текущей сессии процесса.">Последний раз</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {backendSlowEndpoints.map((row) => (
                    <tr key={`${row.method}-${row.path}`}>
                      <td className="max-w-[420px] truncate px-4 py-3 font-mono text-xs">
                        {row.method} {row.path}
                      </td>
                      <td className="px-4 py-3">{numberFormat.format(row.count || 0)}</td>
                      <td className="px-4 py-3">{metricFormat(row.avgLatencyMs, ' мс')}</td>
                      <td className="px-4 py-3 font-semibold text-amber-700">{metricFormat(row.p95LatencyMs, ' мс')}</td>
                      <td className="px-4 py-3">{metricFormat(row.maxLatencyMs, ' мс')}</td>
                      <td className="px-4 py-3">{numberFormat.format(row.users || 0)}</td>
                      <td className="px-4 py-3">{compactList(row.sources, (item) => `${item.source}: ${numberFormat.format(item.count || 0)}`)}</td>
                      <td className="px-4 py-3">{row.statuses?.length ? row.statuses.join(', ') : '-'}</td>
                      <td className="max-w-[260px] truncate px-4 py-3 text-xs text-slate-500">
                        {row.topUserAgents?.[0]?.userAgent || '-'}
                      </td>
                      <td className="px-4 py-3">{formatDate(row.lastSeenAt)}</td>
                    </tr>
                  ))}
                  {!backendSlowEndpoints.length ? (
                    <tr>
                      <td className="px-4 py-6 text-slate-500" colSpan={10}>
                        Backend не видел медленных handlers в текущей сессии процесса
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            <div className="border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
              Порог: {metricFormat(data?.apiPerformance?.slowThresholdMs, ' мс')}. Счетчик хранится в памяти backend-процесса и обнуляется после рестарта.
            </div>
          </div>

          <div className="rounded border border-slate-200 bg-white">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <h2 className="font-semibold">
                <HelpLabel tip="Список OTA-клиентов и опубликованных runtime/release версий, которые backend нашел в папке обновлений.">
                  Клиенты и релизы
                </HelpLabel>
              </h2>
              <Server size={18} className="text-slate-500" />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <Th tip="appKey клиента, для которого опубликован OTA release.">Клиент</Th>
                    <Th tip="Runtime version приложения. OTA применяется только если runtime совпадает с установленным build.">Runtime</Th>
                    <Th tip="Идентификатор опубликованного OTA release.">Release</Th>
                    <Th tip="Платформы, для которых есть артефакты обновления.">Платформы</Th>
                    <Th tip="Когда release был опубликован.">Дата</Th>
                    <Th tip="Комментарий или сообщение публикации OTA.">Сообщение</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(data?.updateClients?.clients || []).flatMap((client) =>
                    (client.runtimes?.length ? client.runtimes : [{ runtimeVersion: '-', releaseId: null }]).map((runtime) => (
                      <tr key={`${client.appKey}-${runtime.runtimeVersion}-${runtime.releaseId || 'empty'}`}>
                        <td className="px-4 py-3 font-semibold">{client.appKey}</td>
                        <td className="px-4 py-3">{runtime.runtimeVersion}</td>
                        <td className="px-4 py-3 font-mono text-xs">{runtime.releaseId || '-'}</td>
                        <td className="px-4 py-3">{runtime.platforms?.join(', ') || '-'}</td>
                        <td className="px-4 py-3">{formatDate(runtime.createdAt)}</td>
                        <td className="max-w-[260px] truncate px-4 py-3">{runtime.message || '-'}</td>
                      </tr>
                    ))
                  )}
                  {!data?.updateClients?.clients?.length ? (
                    <tr>
                      <td className="px-4 py-6 text-slate-500" colSpan={6}>
                        OTA-клиенты не найдены
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-4 py-3">
              <h2 className="font-semibold">
                <HelpLabel tip="Общие состояния пользователей, push-токенов и подписок, которые помогают находить старые или зависшие записи.">
                  Состояния
                </HelpLabel>
              </h2>
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 p-4 text-sm">
              <dt className="text-slate-500"><HelpLabel tip="Общее количество пользователей в базе.">Пользователей всего</HelpLabel></dt>
              <dd className="text-right font-semibold">{numberFormat.format(data?.users?.total || 0)}</dd>
              <dt className="text-slate-500"><HelpLabel tip="Пользователи, которые были активны за последние 7 дней.">Были за 7 дней</HelpLabel></dt>
              <dd className="text-right font-semibold">{numberFormat.format(data?.users?.seenLast7Days || 0)}</dd>
              <dt className="text-slate-500"><HelpLabel tip="Пользователи, которые давно не появлялись, но у них еще есть push-токены.">Старые пользователи с push</HelpLabel></dt>
              <dd className="text-right font-semibold">{numberFormat.format(data?.users?.staleWithPushTokens || 0)}</dd>
              <dt className="text-slate-500"><HelpLabel tip="Expo push-токены, которые давно не обновлялись и могут быть мусором.">Старые Expo токены</HelpLabel></dt>
              <dd className="text-right font-semibold">{numberFormat.format(data?.push?.staleExpoTokens || 0)}</dd>
              <dt className="text-slate-500"><HelpLabel tip="Общее количество UnifiedPush-подписок.">UnifiedPush всего</HelpLabel></dt>
              <dd className="text-right font-semibold">{numberFormat.format(data?.push?.unifiedSubscriptions || 0)}</dd>
              <dt className="text-slate-500"><HelpLabel tip="UnifiedPush-подписки, которые давно не обновлялись.">Старые UnifiedPush</HelpLabel></dt>
              <dd className="text-right font-semibold">{numberFormat.format(data?.push?.staleUnifiedSubscriptions || 0)}</dd>
            </dl>
          </div>
        </section>

        <section className="rounded border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 className="font-semibold">
              <HelpLabel tip="Последние warning/critical события из мобильного приложения: slow-api, socket-disconnected, 5xx и другие проблемы.">
                Последние проблемы приложения
              </HelpLabel>
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <Th tip="Когда событие произошло на устройстве или было принято backend.">Время</Th>
                  <Th tip="Какое мобильное приложение прислало событие.">Клиент</Th>
                  <Th tip="warning - подозрительное событие, critical - ошибка/сбой, требующий внимания.">Уровень</Th>
                  <Th tip="Экран или route приложения, если он был известен в момент события.">Экран</Th>
                  <Th tip="Стабильный deviceId приложения. Помогает понять, проблема у одного устройства или у многих.">Устройство</Th>
                  <Th tip="Короткое сообщение события: slow-api, socket-disconnected, server-error и т.п.">Сообщение</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(data?.telemetry?.recentIssues || []).map((issue, index) => (
                  <tr key={`${issue.occurredAt}-${issue.deviceId}-${index}`}>
                    <td className="px-4 py-3">{formatDate(issue.occurredAt)}</td>
                    <td className="px-4 py-3 font-semibold">{issue.appKey || '-'}</td>
                    <td className="px-4 py-3">
                      <span className={issue.severity === 'critical' ? 'text-red-600 font-semibold' : 'text-amber-700 font-semibold'}>
                        {issue.severity}
                      </span>
                    </td>
                    <td className="px-4 py-3">{issue.screen || '-'}</td>
                    <td className="max-w-[180px] truncate px-4 py-3 font-mono text-xs">{issue.deviceId || '-'}</td>
                    <td className="max-w-[420px] truncate px-4 py-3 text-slate-600">{issue.message || issue.eventType || '-'}</td>
                  </tr>
                ))}
                {!data?.telemetry?.recentIssues?.length ? (
                  <tr>
                    <td className="px-4 py-6 text-slate-500" colSpan={6}>
                      Проблемных событий пока нет
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 className="font-semibold">
              <HelpLabel tip="Последние запросы мобильных приложений за OTA-обновлениями. Помогает понять, видят ли приложения backend обновлений.">
                Последние OTA-запросы
              </HelpLabel>
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <Th tip="Когда backend получил OTA-запрос.">Время</Th>
                  <Th tip="Тип OTA-запроса или результата, который записал backend.">Тип</Th>
                  <Th tip="appKey клиента, который запросил обновление.">Клиент</Th>
                  <Th tip="Runtime version установленного приложения. OTA подходит только при совпадении runtime.">Runtime</Th>
                  <Th tip="Платформа устройства: android или ios.">Платформа</Th>
                  <Th tip="HTTP статус OTA-запроса. 204 обычно значит, что нового обновления нет.">Статус</Th>
                  <Th tip="User-Agent запроса обновления. Помогает отличать Expo/React Native клиенты.">User-Agent</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(data?.ota?.recent || []).map((row, index) => (
                  <tr key={`${row.at}-${index}`}>
                    <td className="px-4 py-3">{formatDate(row.at)}</td>
                    <td className="px-4 py-3">{row.type}</td>
                    <td className="px-4 py-3 font-semibold">{row.appKey || '-'}</td>
                    <td className="px-4 py-3">{row.runtimeVersion || '-'}</td>
                    <td className="px-4 py-3">{row.platform || '-'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded px-2 py-1 text-xs font-semibold ${statusClass(row.statusCode)}`}>
                        {row.statusCode || '-'}
                      </span>
                    </td>
                    <td className="max-w-[360px] truncate px-4 py-3 text-slate-500">{row.userAgent || '-'}</td>
                  </tr>
                ))}
                {!data?.ota?.recent?.length ? (
                  <tr>
                    <td className="px-4 py-6 text-slate-500" colSpan={7}>
                      Запросов обновлений пока нет
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
