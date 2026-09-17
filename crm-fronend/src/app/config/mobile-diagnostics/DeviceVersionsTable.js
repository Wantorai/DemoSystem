'use client';

import { useMemo, useState } from 'react';
import { Smartphone } from 'lucide-react';

const statuses = {
  current: ['Актуальное OTA', 'Точное совпадение с текущим опубликованным OTA для этого приложения, платформы и runtime.', 'text-emerald-700'],
  latest_observed: ['Последнее замеченное OTA', 'Совпадает с самым новым OTA в выборке. Данных о опубликованном релизе этого приложения на сервере нет.', 'text-slate-600'],
  not_seen_since_release: ['Нет данных после выпуска', 'Последнее событие телефона старше даты целевого OTA. Неизвестно, обновился ли он после этого.', 'text-slate-600'],
  older_ota: ['Старое OTA', 'Телефон прислал событие после даты целевого OTA, но запускал более старое. Источник сравнения указан в столбце целевого OTA.', 'text-amber-700'],
  embedded: ['Встроенный JS', 'Запущен код из установленного билда; для этого runtime есть целевое OTA. Причина отсутствия OTA неизвестна.', 'text-amber-700'],
  different_ota: ['Другое OTA', 'Идентификаторы отличаются, но считать запущенное OTA более старым нельзя. Возможен откат или другой источник обновлений.', 'text-slate-600'],
  build_mismatch: ['Билд отличается', 'Та же проверка, что в Меню: локальный buildTag не совпадает с именем актуальной папки builds/ на backend приложения. Смотрите дату проверки.', 'text-amber-700'],
  build_matches: ['Билд соответствует', 'Проверка в приложении подтвердила совпадение buildTag с /app-version его backend на указанную дату.', 'text-emerald-700'],
  unknown: ['Недостаточно данных', 'Нет надежных полей для сравнения. Старые события могут содержать только версию из Expo config, а не установленного приложения.', 'text-slate-500'],
};
const Status = ({ value }) => {
  const [label, tip, color] = statuses[value] || statuses.unknown;
  return <span className={`font-medium ${color}`} title={tip} tabIndex={0}>{label}</span>;
};
const date = value => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString('ru-RU') : '-';
const needsUpdate = row => ['older_ota', 'embedded'].includes(row.otaStatus) || row.buildStatus === 'build_mismatch' || row.versionCheck?.updateOutdated === true;

export default function DeviceVersionsTable({ inventory }) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const rows = useMemo(() => (inventory?.devices || []).filter(row => {
    if (filter === 'old' && !needsUpdate(row)) return false;
    if (filter === 'unseen' && row.otaStatus !== 'not_seen_since_release') return false;
    if (filter === 'unknown' && row.otaStatus !== 'unknown' && row.buildStatus !== 'unknown') return false;
    return [row.appKey, row.deviceId, row.deviceModel, row.userId, row.platform].join(' ').toLowerCase().includes(search.trim().toLowerCase());
  }), [inventory, search, filter]);
  const devices = inventory?.devices || [];
  return (
    <section className="min-w-0 border-y border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4">
        <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
          <Smartphone size={18} aria-hidden="true" /> Версии на устройствах
        </h2>
        <div className="flex flex-wrap gap-2">
          <input aria-label="Поиск устройства" value={search} onChange={event => setSearch(event.target.value)} placeholder="Клиент, модель, ID" className="w-56 max-w-full rounded border border-slate-300 px-3 py-2 text-sm" />
          <select aria-label="Статус обновления" value={filter} onChange={event => setFilter(event.target.value)} className="max-w-full rounded border border-slate-300 px-3 py-2 text-sm">
            <option value="all">Все ({devices.length})</option>
            <option value="old">Требуют внимания ({devices.filter(needsUpdate).length})</option>
            <option value="unseen">Нет данных после выпуска ({inventory?.counts?.ota?.not_seen_since_release || 0})</option>
            <option value="unknown">Недостаточно данных</option>
          </select>
        </div>
      </div>
      <div className="px-4 pb-3 text-xs text-slate-500" title="Устройства, приславшие диагностику за указанный период. Это не полный список установок. Данные списка обновляются не чаще раза в минуту; дата последнего события определяет актуальность информации о телефоне.">
        Период: {date(inventory?.coverage?.from)} — {date(inventory?.coverage?.to)}. Устройств: {devices.length}.
        {inventory?.coverage?.truncated ? <span className="ml-2 text-amber-700">Выборка ограничена</span> : null}
      </div>
      <div className="max-h-[600px] overflow-auto">
        <table className="w-full min-w-[1300px] text-left text-sm">
          <thead className="sticky top-0 bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3" title="Приложение, модель, ОС и идентификатор установки. После переустановки ID может измениться.">Устройство</th>
              <th className="px-4 py-3" title="ID пользователя внутри backend этого клиента, а не глобальный ID всех компаний.">Пользователь</th>
              <th className="px-4 py-3" title="BuildTag из проверки Меню: имя билда из builds/. Ниже приведены дополнительные нативные версии; Config означает старые непроверенные данные из Expo config.">Билд</th>
              <th className="px-4 py-3" title="Результат существующей проверки приложения: сравнение локального buildTag и /app-version его backend, где версия определяется папкой builds/.">Статус билда</th>
              <th className="px-4 py-3" title="Runtime определяет совместимость OTA с установленным приложением. Разные runtime между собой по OTA не сравниваются.">Runtime / Diag</th>
              <th className="px-4 py-3" title="Идентификатор реально запущенного OTA, а не только скачанного обновления. Полный ID доступен при наведении.">Запущенное OTA</th>
              <th className="px-4 py-3" title="Текущий релиз локального сервера либо самое новое OTA, замеченное в диагностике совместимых устройств.">Целевое OTA</th>
              <th className="px-4 py-3" title="Учитывает версию OTA и время последнего события относительно даты выпуска.">Статус OTA</th>
              <th className="px-4 py-3" title="Результат проверки доступности OTA в приложении, как в Меню. Он отражает состояние на дату проверки; новые релизы после этой даты не учтены.">Проверка в приложении</th>
              <th className="px-4 py-3" title="Время последнего диагностического события, а не подтверждение текущего соединения.">Последнее событие</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map(row => (
              <tr key={`${row.appKey}:${row.deviceId}`}>
                <td className="px-4 py-3">
                  <div className="font-semibold">{row.appKey}</div>
                  <div>{row.deviceModel || '-'} · {row.platform || '-'} {row.osVersion || ''}</div>
                  <div className="max-w-64 break-all text-xs text-slate-500">{row.deviceId}</div>
                </td>
                <td className="px-4 py-3">{row.userId ?? '-'}</td>
                <td className="px-4 py-3">
                  <div className="max-w-48 break-words font-medium">{row.installedBuildTag || row.versionCheck?.localBuildTag || 'Название билда не передано'}</div>
                  <div className="text-xs text-slate-500" title="Это технические версия и номер приложения; они не являются названием папки builds/.">{row.nativeAppVersion && row.nativeBuildVersion ? 'Native' : 'Expo config'}: {row.nativeAppVersion || row.appVersion || '-'} ({row.nativeBuildVersion || row.buildNumber || '-'})</div>
                  {row.buildTagSource ? <div className="text-xs text-slate-500" title="embedded-config - тег из конфигурации установленного APK/IPA; running-config - запасное значение текущей конфигурации, которое могло прийти с OTA.">{row.buildTagSource === 'embedded-config' ? 'Тег из установленного билда' : 'Тег из текущего config'}</div> : null}
                </td>
                <td className="px-4 py-3"><Status value={row.buildStatus} />
                  {row.targetBuild ? <div className="max-w-48 break-words text-xs text-slate-500">На сервере: {row.targetBuild.tag}</div> : null}
                  <div className="text-xs text-slate-500">{row.targetBuild ? date(row.targetBuild.checkedAt) : row.versionTelemetryVersion ? 'Проверка билда еще не получена' : 'Нет новых данных о билде'}</div>
                </td>
                <td className="max-w-48 break-words px-4 py-3">{row.runtimeVersion || '-'}<div className="text-xs text-slate-500">Diag {row.diagnosticsSchemaVersion ?? '-'}</div></td>
                <td className="px-4 py-3"><span title={row.otaUpdateId || ''}>{row.otaUpdateId?.slice(0, 8) || (row.otaIsEmbeddedLaunch === true ? 'Встроенный JS' : '-')}</span><div className="text-xs text-slate-500">{date(row.otaCreatedAt)}</div></td>
                <td className="px-4 py-3"><span title={row.targetOta?.updateId || ''}>{row.targetOta?.updateId?.slice(0, 8) || '-'}</span><div className="text-xs text-slate-500">{date(row.targetOta?.createdAt)}</div><div className="text-xs text-slate-500">{row.targetOta ? row.targetOta.source === 'published' ? 'Опубликовано на сервере' : 'Замечено на устройствах' : ''}</div></td>
                <td className="px-4 py-3"><Status value={row.otaStatus} /></td>
                <td className="px-4 py-3"><div>{row.versionCheck?.updateOutdated == null ? 'OTA не проверено' : row.versionCheck.updateOutdated ? 'Доступно OTA' : 'Нового OTA нет'}</div><div className="text-xs text-slate-500">{date(row.versionCheck?.otaCheckedAt)}</div></td>
                <td className="px-4 py-3">{date(row.lastSeenAt)}</td>
              </tr>
            ))}
            {!rows.length ? <tr><td colSpan={10} className="px-4 py-8 text-center text-slate-500">{inventory ? 'Нет устройств для выбранного фильтра' : 'Данные версий устройств пока недоступны'}</td></tr> : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
