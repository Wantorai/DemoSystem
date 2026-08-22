'use client';

import { useState, useEffect, useRef } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ReferenceLine,
  CartesianGrid,
} from 'recharts';
import { format, subDays, parseISO } from 'date-fns';
import Spinner from "../../components/Spinner";


// Нормализует разные форматы даты
function normalizeDate(raw) {
  if (!raw) return null;
  if (typeof raw === 'object' && raw.date) {
    return parseISO(raw.date);
  }
  if (typeof raw === 'string') {
    // возьмём часть до пробела
    const part = raw.split(' ')[0];
    return parseISO(part);
  }
  return null;
}

const YEAR_DAYS = 365;
const SPECIFICATIONS_REPORT_KEY = 'report_1751193932752';

function isSpecificationsDashboardReport(cfg) {
  if (!cfg) return false;
  if (cfg.key === SPECIFICATIONS_REPORT_KEY) return true;
  if (String(cfg.label || '').trim().toLowerCase().includes('спецификац')) return true;

  const fields = [
    cfg.dateField,
    ...(Array.isArray(cfg.valueFields) ? cfg.valueFields : []),
    ...(Array.isArray(cfg.series)
      ? cfg.series.flatMap((series) => [
          series?.dateField,
          ...(Array.isArray(series?.valueFields) ? series.valueFields : []),
        ])
      : []),
  ];

  return fields.some((field) => String(field || '').includes('data.param19'));
}

function getYearsLabel(days) {
  const years = Math.max(0, Math.floor(Number(days || 0) / YEAR_DAYS));
  if (years <= 0) return 'меньше 1 года';

  const lastDigit = years % 10;
  const lastTwoDigits = years % 100;
  if (lastDigit === 1 && lastTwoDigits !== 11) return `${years} год`;
  if (lastDigit >= 2 && lastDigit <= 4 && (lastTwoDigits < 12 || lastTwoDigits > 14)) return `${years} года`;
  return `${years} лет`;
}

export default function DashboardPage() {
  const [configs, setConfigs] = useState([]);
  const [activeTab, setActiveTab] = useState('');
  const [range, setRange] = useState(() => {
    const saved = localStorage.getItem('dashboard_range');
    return saved ? Number(saved) : 60; // 60 — значение по умолчанию
  });

  const [granularity, setGranularity] = useState(() => {
    return localStorage.getItem('dashboard_granularity') || 'week'; // 'week' по умолчанию
  });
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fieldOptions, setFieldOptions] = useState([]);
    // === новый стейт для технологов ===
  const [techOptions, setTechOptions] = useState([]);
  const [specReadyUserOptions, setSpecReadyUserOptions] = useState([]);
  const [selectedTech, setSelectedTech] = useState('');
  const [compLabelMap, setCompLabelMap] = useState({}); // { safeKey: humanLabel }
  const [paylistMap, setPaylistMap] = useState({});
  const [orderPriceField, setOrderPriceField] = useState('param10');
  // const [chartKey, setChartKey] = useState(0); // форсирует ремонт LineChart при обновлении данных




  // Загрузить конфиги с бэка
  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/dashboard-configs`)
      .then(res => res.json())
      .then(data => {
        const arr = Array.isArray(data) ? data : [];
        setConfigs(arr);
        if (arr.length) setActiveTab(arr[0].key);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);


    // 2) Загрузить список технологов
  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/technics`)
      .then(res => res.json())
      .then(data => {
        // ожидаем data = [{ id: 'tech1', name: 'Иванов' }, ...]
        setTechOptions(data);
      })
      .catch(err => {
        console.error('Не удалось загрузить список технологов:', err);
        setTechOptions([]);
      });
  }, []);

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/paylists`)
      .then(res => res.json())
      .then(data => {
        const map = {};
        (Array.isArray(data) ? data : []).forEach((item) => {
          map[String(item.id)] = item.name;
        });
        setPaylistMap(map);
      })
      .catch(err => {
        console.error('Не удалось загрузить список типов оплат:', err);
        setPaylistMap({});
      });
  }, []);

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/technics?specReadyUsers=true`)
      .then(res => res.json())
      .then(data => {
        setSpecReadyUserOptions(Array.isArray(data) ? data : []);
      })
      .catch(err => {
        console.error('Не удалось загрузить список пользователей для спецификаций:', err);
        setSpecReadyUserOptions([]);
      });
  }, []);

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/mainModel`)
      .then(res => res.json())
      .then(data => {
        const fields = Array.isArray(data) ? data : [];
        const priceField = fields.find((field) => (
          String(field?.label || '').trim().toLowerCase() === 'цена заказа'
        ));
        setOrderPriceField(priceField?.paramName || 'param10');
      })
      .catch(err => {
        console.error('Не удалось загрузить настройки полей заказа:', err);
        setOrderPriceField('param10');
      });
  }, []);


  // Загрузка fieldOptions и построение chartData
  useEffect(() => {
    if (!activeTab) return;
    const cfg = configs.find(c => c.key === activeTab);
    if (!cfg) return;

    // helper: возвращает массив значений по пути (поддерживает массивы)
    const resolvePathAsArray = (obj, path) => {
      const parts = path.split('.');
      let current = obj;
      for (let i = 0; i < parts.length; i++) {
        if (current == null) return [];
        if (Array.isArray(current)) {
          return current.flatMap(entry => resolvePathAsArray(entry, parts.slice(i).join('.')));
        }
        current = current[parts[i]];
      }
      if (current && typeof current === 'object' && !Array.isArray(current)) {
        if ('date' in current) return [current.date];
        if ('checked' in current) return [current.checked];
        if ('value' in current) return [current.value];
      }
      return Array.isArray(current) ? current : [current].filter(v => v !== undefined);
    };

    const resolveFallbackValue = (item, fieldPath) => {
      if (!fieldPath || !fieldPath.includes('.')) return undefined;
      const parts = fieldPath.split('.');
      if (parts[0] !== 'newParams') return undefined;
      const legacyTopLevelKey = parts[parts.length - 1];
      return item?.[legacyTopLevelKey];
    };

    const parseDashboardNumber = (value) => {
      if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
      const normalized = String(value ?? '')
        .trim()
        .replace(/\s/g, '')
        .replace(',', '.');
      if (!/^-?\d+(\.\d+)?$/.test(normalized)) return 0;
      return Number(normalized) || 0;
    };

    const isCheckLikeField = (fieldPath, fields = []) => {
      const option = fields.find((field) => field.path === fieldPath);
      const label = String(option?.label || '').trim().toLowerCase();
      const normalizedPath = String(fieldPath || '').toLowerCase();
      return (
        normalizedPath.endsWith('.checked') ||
        label.includes('готовность') ||
        label.includes('спец')
      );
    };

    const controller = new AbortController();
    const signal = controller.signal;

    const fetchAndBuild = async () => {
      const to = new Date();

      // подготовка series (как у тебя была логика)
      const rawSeries = Array.isArray(cfg.series) ? cfg.series : [];
      const isLegacy = rawSeries.length === 0;
      const seriesConfigs = isLegacy
        ? [{
            id: 's0',
            label: cfg.label || 'Серия',
            dateField: cfg.dateField,
            valueFields: Array.isArray(cfg.valueFields) ? cfg.valueFields : (cfg.valueFields ? [cfg.valueFields] : [])
          }]
        : rawSeries.map(s => ({
            id: s.id || (`s_${Date.now()}`),
            label: s.label || cfg.label || 'Серия',
            dateField: s.dateField || cfg.dateField || '',
            valueFields: Array.isArray(s.valueFields) ? s.valueFields : (s.valueFields ? s.valueFields.split?.(',') || [] : [])
          }));
      const multiSeries = !isLegacy && Array.isArray(seriesConfigs) && seriesConfigs.length > 1;
      const DASH_DEBUG = false;
      const SPEC_DASH_DEBUG = false;

      try {
        // 1) Параллельно подгрузим fieldOptions (локально) и элементы endpoint
        const fieldsUrl = `${process.env.NEXT_PUBLIC_API_URL}/dashboard-configs/fields/${cfg.endpoint}`;
        const itemsUrl = new URL(`${process.env.NEXT_PUBLIC_API_URL}/${cfg.endpoint}`);
        if (selectedTech) {
          if (isSpecificationsDashboardReport(cfg)) {
            itemsUrl.searchParams.set('specReadyUserFilter', selectedTech);
            const selectedSpecReadyUser = specReadyUserOptions.find((option) => String(option.id) === String(selectedTech));
            const selectedSpecReadyUserName = String(selectedTech).startsWith('name:')
              ? String(selectedTech).slice(5)
              : selectedSpecReadyUser?.name;
            if (selectedSpecReadyUserName) itemsUrl.searchParams.set('specReadyUserName', selectedSpecReadyUserName);
          } else if (/^\d+$/.test(String(selectedTech))) {
            itemsUrl.searchParams.set('technologistId', selectedTech);
          }
        }

        const [fieldsRes, itemsRes] = await Promise.all([
          fetch(fieldsUrl, { signal }),
          fetch(itemsUrl.toString(), { signal }),
        ]);

        if (signal.aborted) return;

        const fieldsRaw = await fieldsRes.json();
        const itemsRaw = await itemsRes.json();
        const items = (Array.isArray(itemsRaw) ? itemsRaw : []).map((it) => {
          const out = { ...(it || {}) };
          if (typeof out.newParams === 'string') {
            try {
              const parsed = JSON.parse(out.newParams);
              if (parsed && typeof parsed === 'object') {
                out.newParams = parsed;
              }
            } catch {
              // оставляем как есть
            }
          }
          return out;
        });

        if (SPEC_DASH_DEBUG) {
          const checkedSpecs = items.filter((item) => {
            const spec = item?.data?.param19;
            return spec && typeof spec === 'object' && !Array.isArray(spec) && (spec.checked === true || spec.checked === 'true') && spec.date;
          });
          console.log('[SpecDashDbg][items]', {
            reportKey: cfg?.key,
            reportLabel: cfg?.label,
            selectedTech,
            requestUrl: itemsUrl.toString(),
            itemsCount: items.length,
            checkedSpecsCount: checkedSpecs.length,
            checkedSpecDates: checkedSpecs.slice(0, 10).map((item) => item?.data?.param19?.date),
          });
        }

        const fieldArr = Array.isArray(fieldsRaw) ? fieldsRaw : [];
        // обновим state для UI (не используем его внутри этого эффекта; далее будем работать с fieldArr)
        setFieldOptions(fieldArr);

        const counts = {}; // dateKey -> { key -> number }
        const breakdowns = {}; // dateKey -> { key -> [{ orderId, address, product, value }] }
        if (DASH_DEBUG) {
          console.log('[DashDbg][start]', {
            reportKey: cfg?.key,
            endpoint: cfg?.endpoint,
            isLegacy,
            multiSeries,
            seriesConfigs,
            itemsCount: items.length,
          });
        }

        if (DASH_DEBUG) {
          const offeredRows = items.filter((row) => {
            const v = row?.newParams?.OrderOffered;
            return v === 1 || v === '1';
          });
          console.log('[DashDbg][offered-scan]', {
            reportKey: cfg?.key,
            offeredCount: offeredRows.length,
            sample: offeredRows.slice(0, 5).map((r) => ({
              id: r?.id ?? null,
              serviceDate: r?.serviceDate ?? null,
              offered: r?.newParams?.OrderOffered ?? null,
            })),
          });
        }

        // агрегация — та же логика, но использует seriesConfigs
        items.forEach(item => {
          seriesConfigs.forEach(s => {
            const isSpecReport = isSpecificationsDashboardReport(cfg);
            const dateValues = isSpecReport
              ? [item?.data?.param19?.date].filter(Boolean)
              : resolvePathAsArray(item, s.dateField);
            (s.valueFields || []).forEach(fieldPath => {
              const values = isSpecReport && String(fieldPath || '').includes('data.param19.checked')
                ? [item?.data?.param19?.checked]
                : resolvePathAsArray(item, fieldPath);

              dateValues.forEach((rawDate, idx) => {
                if (rawDate && typeof rawDate === 'object' && 'date' in rawDate) rawDate = rawDate.date;
                const dt = normalizeDate(rawDate);
                const key = dt ? format(dt, 'yyyy-MM-dd') : null;
                if (!dt) return;
                counts[key] = counts[key] || {};

                let rawVal = (values && values.length > 0) ? (values[idx] !== undefined ? values[idx] : values[0]) : undefined;
                if (rawVal === undefined || rawVal === null || rawVal === '') {
                  rawVal = resolveFallbackValue(item, fieldPath);
                }
                if (rawVal && typeof rawVal === 'object') {
                  if ('checked' in rawVal) rawVal = rawVal.checked;
                  else if ('value' in rawVal) rawVal = rawVal.value;
                  else if ('date' in rawVal) rawVal = rawVal.date;
                  else rawVal = String(rawVal);
                }

                let num = 0;
                if (typeof rawVal === 'boolean') {
                  num = rawVal ? 1 : 0;
                } else if (typeof rawVal === 'number') {
                  num = Number.isFinite(rawVal) ? rawVal : 0;
                } else {
                  // Считаем числом только "чистые" numeric-строки.
                  // Любой текст (например адрес) = 0, чтобы не получать ложные "7203".
                  const normalized = String(rawVal ?? '').trim().replace(',', '.');
                  const isNumericString = /^-?\d+(\.\d+)?$/.test(normalized);
                  num = isNumericString ? (Number(normalized) || 0) : 0;
                }

                let storeKey;
                if (multiSeries) {
                  storeKey = `${s.id}::${fieldPath}`;
                } else {
                  if ((s.valueFields || []).length === 1) storeKey = 'value';
                  else storeKey = fieldPath;
                }

                counts[key][storeKey] = (counts[key][storeKey] || 0) + num;
                if (num !== 0) {
                  const orderData = item?.data && typeof item.data === 'object' ? item.data : {};
                  const linkedOrder = item?.order || item?.Order || null;
                  const linkedOrderData = linkedOrder?.data && typeof linkedOrder.data === 'object' ? linkedOrder.data : {};
                  const address =
                    item?.address ??
                    linkedOrderData?.param5 ??
                    linkedOrderData?.address ??
                    orderData?.param5 ??
                    orderData?.address ??
                    item?.newParams?.address ??
                    item?.newParams?.param5 ??
                    'Адрес не указан';
                  const product =
                    item?.product ??
                    linkedOrderData?.param9 ??
                    linkedOrderData?.product ??
                    orderData?.param9 ??
                    orderData?.product ??
                    item?.newParams?.product ??
                    item?.newParams?.param9 ??
                    'Изделие не указано';
                  const paymentType =
                    linkedOrderData?.param14 ??
                    orderData?.param14 ??
                    item?.newParams?.param14 ??
                    item?.paymentType ??
                    '';
                  const linkedOrderPrice = orderPriceField
                    ? parseDashboardNumber(linkedOrderData?.[orderPriceField] ?? orderData?.[orderPriceField])
                    : 0;
                  const displayValue = (
                    cfg?.endpoint === 'orderConfigs' &&
                    linkedOrderPrice &&
                    isCheckLikeField(fieldPath, fieldArr)
                  )
                    ? linkedOrderPrice
                    : num;

                  breakdowns[key] = breakdowns[key] || {};
                  breakdowns[key][storeKey] = breakdowns[key][storeKey] || [];
                  breakdowns[key][storeKey].push({
                    orderId: item?.order_id ?? linkedOrder?.id ?? item?.id ?? null,
                    address: String(address || 'Адрес не указан'),
                    product: String(product || 'Изделие не указано'),
                    paymentType: String(paymentType || ''),
                    value: displayValue,
                  });
                }
              });
            });
          });
        });

        if (DASH_DEBUG) {
          const sampleDates = Object.keys(counts).sort().slice(0, 8);
          const sampleCounts = sampleDates.map((d) => ({ date: d, values: counts[d] }));
          console.log('[DashDbg][counts]', {
            reportKey: cfg?.key,
            datesCount: Object.keys(counts).length,
            sampleCounts,
          });
        }

        if (SPEC_DASH_DEBUG) {
          const specCountDates = Object.keys(counts).sort();
          console.log('[SpecDashDbg][counts]', {
            reportKey: cfg?.key,
            selectedTech,
            countDatesCount: specCountDates.length,
            countDatesSample: specCountDates.slice(0, 20).map((dateKey) => ({
              dateKey,
              values: counts[dateKey],
            })),
          });
        }

        // build data according to granularity (твоя прежняя логика)...
        const data = [];
        const addBreakdown = (pt, dateKey, storeKey, targetKey = storeKey) => {
          const rows = breakdowns[dateKey]?.[storeKey] || [];
          if (!rows.length) return;
          pt.__breakdown = pt.__breakdown || {};
          pt.__breakdown[targetKey] = [
            ...(pt.__breakdown[targetKey] || []),
            ...rows,
          ];
        };

        const fillPt = (pt, dateKey) => {
          if (!multiSeries && seriesConfigs.length === 1 && seriesConfigs[0].valueFields.length === 1) {
            pt.value = counts[dateKey]?.['value'] || 0;
            addBreakdown(pt, dateKey, 'value');
          } else {
            if (multiSeries) {
              seriesConfigs.forEach(s => {
                (s.valueFields || []).forEach(vf => {
                  const comp = `${s.id}::${vf}`;
                  pt[comp] = counts[dateKey]?.[comp] || 0;
                  addBreakdown(pt, dateKey, comp);
                });
              });
            } else {
              (seriesConfigs[0].valueFields || []).forEach(vf => {
                pt[vf] = counts[dateKey]?.[vf] || 0;
                addBreakdown(pt, dateKey, vf);
              });
            }
          }
        };

        if (granularity === 'day') {
          const countDates = Object.keys(counts).sort();
          if (multiSeries && countDates.length > 0) {
            const minDate = new Date(countDates[0]);
            const maxDate = new Date(countDates[countDates.length - 1]);
            for (let d = new Date(minDate); d <= maxDate; d.setDate(d.getDate() + 1)) {
              const k = format(d, 'yyyy-MM-dd');
              const pt = { date: format(d, 'MMM d') };
              fillPt(pt, k);
              data.push(pt);
            }
          } else {
            for (let i = 0; i < range; i++) {
              const d = subDays(to, range - 1 - i);
              const k = format(d, 'yyyy-MM-dd');
              const pt = { date: format(d, 'MMM d') };
              fillPt(pt, k);
              data.push(pt);
            }
          }
        } else if (granularity === 'week') {
          const weeks = Math.ceil(range / 7);
          for (let w = 0; w < weeks; w++) {
            const start = subDays(to, (weeks - 1 - w) * 7);
            const pt = { date: `${format(start, 'MMM d')}–${format(subDays(start, -6), 'MMM d')}` };
            if (!multiSeries && seriesConfigs.length === 1 && seriesConfigs[0].valueFields.length === 1) {
              let sum = 0;
              for (let j = 0; j < 7; j++) {
                const dd = format(subDays(start, -j), 'yyyy-MM-dd');
                sum += counts[dd]?.['value'] || 0;
                addBreakdown(pt, dd, 'value');
              }
              pt.value = sum;
            } else {
              if (multiSeries) {
                seriesConfigs.forEach(s => {
                  (s.valueFields || []).forEach(vf => {
                    const comp = `${s.id}::${vf}`;
                    let sum = 0;
                    for (let j = 0; j < 7; j++) {
                      const dd = format(subDays(start, -j), 'yyyy-MM-dd');
                      sum += counts[dd]?.[comp] || 0;
                      addBreakdown(pt, dd, comp);
                    }
                    pt[comp] = sum;
                  });
                });
              } else {
                (seriesConfigs[0].valueFields || []).forEach(vf => {
                  let sum = 0;
                  for (let j = 0; j < 7; j++) {
                    const dd = format(subDays(start, -j), 'yyyy-MM-dd');
                    sum += counts[dd]?.[vf] || 0;
                    addBreakdown(pt, dd, vf);
                  }
                  pt[vf] = sum;
                });
              }
            }
            data.push(pt);
          }
        } else if (granularity === 'month') {
          const months = Math.ceil(range / 30);
          for (let i = 0; i < months; i++) {
            const monthDate = subDays(to, i * 30);
            const yearMonth = format(monthDate, 'yyyy-MM');
            const pt = { date: format(monthDate, 'MMMM yyyy') };
            if (!multiSeries && seriesConfigs.length === 1 && seriesConfigs[0].valueFields.length === 1) {
              let sum = 0;
              for (const key in counts) if (key.startsWith(yearMonth)) {
                sum += counts[key]?.['value'] || 0;
                addBreakdown(pt, key, 'value');
              }
              pt.value = sum;
            } else {
              if (multiSeries) {
                seriesConfigs.forEach(s => {
                  (s.valueFields || []).forEach(vf => {
                    const comp = `${s.id}::${vf}`;
                    let sum = 0;
                    for (const key in counts) if (key.startsWith(yearMonth)) {
                      sum += counts[key]?.[comp] || 0;
                      addBreakdown(pt, key, comp);
                    }
                    pt[comp] = sum;
                  });
                });
              } else {
                (seriesConfigs[0].valueFields || []).forEach(vf => {
                  let sum = 0;
                  for (const key in counts) if (key.startsWith(yearMonth)) {
                    sum += counts[key]?.[vf] || 0;
                    addBreakdown(pt, key, vf);
                  }
                  pt[vf] = sum;
                });
              }
            }
            data.unshift(pt);
          }
        }

        // финализация: sanitize/labelMap/finalData как раньше, но использую fieldArr (локальный)
        const sanitize = k => String(k).replace(/::/g, '__SER__').replace(/\./g, '__DOT__');

        const labelMap = {};
        seriesConfigs.forEach(s => {
          (s.valueFields || []).forEach(vf => {
            if (multiSeries) {
              const safe = sanitize(`${s.id}::${vf}`);
              const fieldLabel = (fieldArr || []).find(o => o.path === vf)?.label || vf;
              labelMap[safe] = `${s.label || s.id} — ${fieldLabel}`;
            } else {
              if ((s.valueFields || []).length === 1) {
                const fieldLabel = (fieldArr || []).find(o => o.path === vf)?.label || vf;
                labelMap['value'] = s.label ? `${s.label} — ${fieldLabel}` : fieldLabel;
              } else {
                const fieldLabel = (fieldArr || []).find(o => o.path === vf)?.label || vf;
                // Single-series with many fields keeps raw keys in finalData
                labelMap[vf] = s.label ? `${s.label} — ${fieldLabel}` : fieldLabel;
              }
            }
          });
        });

        setCompLabelMap(labelMap);

        let finalData;
        if (multiSeries) {
          finalData = data.map(pt => {
            const out = { date: pt.date };
            Object.keys(pt).forEach(k => {
              if (k === 'date') return;
              if (k === '__breakdown') {
                out.__breakdown = {};
                Object.entries(pt.__breakdown || {}).forEach(([rawKey, rows]) => {
                  out.__breakdown[sanitize(rawKey)] = rows;
                });
                return;
              }
              const safe = sanitize(k);
              out[safe] = pt[k];
            });
            return out;
          });
        } else {
          finalData = data.map(pt => ({ ...pt }));
        }

        setChartData(finalData);
        if (DASH_DEBUG) {
          console.log('[DashDbg][finalData]', {
            reportKey: cfg?.key,
            points: finalData.length,
            sample: finalData.slice(0, 8),
          });
        }
        if (SPEC_DASH_DEBUG) {
          console.log('[SpecDashDbg][finalData]', {
            reportKey: cfg?.key,
            selectedTech,
            granularity,
            range,
            points: finalData.length,
            nonZeroPoints: finalData.filter((point) => Object.entries(point).some(([key, value]) => key !== 'date' && key !== '__breakdown' && Number(value) !== 0)).length,
            sample: finalData.filter((point) => Object.entries(point).some(([key, value]) => key !== 'date' && key !== '__breakdown' && Number(value) !== 0)).slice(0, 20),
          });
        }
        if (typeof setChartKey === 'function') setChartKey(k => k + 1);
      } catch (err) {
        if (err.name === 'AbortError') return; // нормально
        console.error('fetchAndBuild error', err);
        setChartData([]);
      }
    };

    fetchAndBuild();

    return () => {
      controller.abort(); // отменим запросы, если activeTab поменяется или компонент размонтируется
    };
  }, [configs, activeTab, range, granularity, selectedTech, orderPriceField, specReadyUserOptions]);


  
  const cfg = configs.find(c => c.key === activeTab);
  // console.log("cfg = ", cfg);
  const isSpecificationsReport = isSpecificationsDashboardReport(cfg);
  const currentTechOptions = isSpecificationsReport ? specReadyUserOptions : techOptions;

  useEffect(() => {
    if (!selectedTech) return;
    const hasSelectedOption = currentTechOptions.some((option) => String(option.id) === String(selectedTech));
    if (!hasSelectedOption) setSelectedTech('');
  }, [currentTechOptions, selectedTech]);

  // Вспомогательный компонент для кнопок
  const ChartControls = () => (

    <div className="flex flex-wrap gap-4 mb-6 items-center">
      {/* фильтр по технологам */}
      <div>
        <label htmlFor="tech-select" className="mr-2">Технолог:</label>
        <select
          id="tech-select"
          value={selectedTech}
          onChange={e => setSelectedTech(e.target.value)}
          className="px-2 py-1 border rounded"
        >
          <option value="">Все</option>
          {currentTechOptions.map(t => (
            <option key={t.id} value={t.id}>
              {t.roleName ? `${t.name} (${t.roleName})` : t.name}
            </option>
          ))}
        </select>
      </div>

    {/* <div className="flex flex-wrap gap-2 mb-6"> */}
      {[7, 30, 60, 90, 180, 365].map(r => (
        <button key={r} onClick={() => handleSetRange(r)}
          className={`px-3 py-1 rounded ${range === r ? 'os-primary-bg text-white' : 'bg-gray-200'}`}>
          {r === 7 ? 'Неделя' : r === 30 ? 'Месяц' : r === 60 ? '2 мес' : r === 90 ? '3 мес' : r === 180 ? 'Полгода' : 'Год'}
        </button>
      ))}
      <button onClick={handleAddYear}
        className="px-3 py-1 rounded bg-gray-200">
        + Год
      </button>
      <span className="px-3 py-1 rounded border border-gray-200 bg-white text-sm text-gray-700">
        На графике: {getYearsLabel(range)}
      </span>
      <button onClick={() => handleSetGranularity('day')}
        className={`px-3 py-1 rounded ${granularity === 'day' ? 'os-primary-bg text-white' : 'bg-gray-200'}`}>
        По дням
      </button>
      <button onClick={() => handleSetGranularity('week')}
        className={`px-3 py-1 rounded ${granularity === 'week' ? 'os-primary-bg text-white' : 'bg-gray-200'}`}>
        По неделям
      </button>
      <button onClick={() => handleSetGranularity('month')}
        className={`px-3 py-1 rounded ${granularity === 'month' ? 'os-primary-bg text-white' : 'bg-gray-200'}`}>
        По месяцам
      </button>
    </div>
  );


  const handleSetRange = (value) => {
    setRange(value);
    localStorage.setItem('dashboard_range', value);
  };

  const handleAddYear = () => {
    setRange((currentRange) => {
      const nextRange = Number(currentRange || 0) + YEAR_DAYS;
      localStorage.setItem('dashboard_range', nextRange);
      return nextRange;
    });
  };

  const handleSetGranularity = (value) => {
    setGranularity(value);
    localStorage.setItem('dashboard_granularity', value);
  };


  const sortedConfigs = [...configs].sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0)
  );


  // console.log('[DBG render] activeTab=', activeTab);
  // console.log('[DBG render] cfg=', cfg);
  // console.log('[DBG render] cfg.valueFields=', cfg?.valueFields);
  // console.log('[DBG render] cfg.series=', cfg?.series);
  // console.log('[DBG render] fieldOptions sample=', fieldOptions?.slice(0,6));
  // console.log('[DBG render] chartData[0]=', (Array.isArray(chartData) && chartData.length) ? chartData[0] : null);


  // Для создания мультиграфика
  function ChartWithMeasuredSize({ chartData = [], cfg = {}, fieldOptions = [], compLabelMap = {}, paylistMap = {} }) {
    const wrapperRef = useRef(null);
    const [size, setSize] = useState({ width: 0, height: 0 });
    const [mountedAt] = useState(() => Date.now());
    const [selectedBreakdown, setSelectedBreakdown] = useState(null);

    // определим режим: seriesMode если cfg.series массив и непустой
    const seriesMode = Array.isArray(cfg.series) && cfg.series.length > 0;

    useEffect(() => {
      const el = wrapperRef.current;
      if (!el) return;
      const measure = () => {
        const rect = el.getBoundingClientRect();
        setSize({ width: Math.floor(rect.width), height: Math.floor(rect.height) });
      };
      const raf = requestAnimationFrame(measure);
      const ro = new ResizeObserver(entries => {
        for (const entry of entries) {
          const cr = entry.contentRect;
          setSize({ width: Math.floor(cr.width), height: Math.floor(cr.height) });
        }
      });
      ro.observe(el);
      return () => {
        cancelAnimationFrame(raf);
        // try { ro.disconnect(); } catch (e) {}
      };
    }, []);

    // palette
    const palette = ['#3182ce', '#10b981', '#f97316', '#ef4444', '#6366f1'];
    const formatDashboardNumber = (value) => new Intl.NumberFormat('ru-RU', {
      maximumFractionDigits: 2,
    }).format(Number(value) || 0);

    // --------------------------
    // SERIES MODE (новая логика — стабильная)
    // --------------------------
    if (seriesMode) {
      // keysToRender из cfg.series
      const sanitize = k => String(k).replace(/::/g, '__SER__').replace(/\./g, '__DOT__');
      const seriesConfigs = cfg.series;
      const multiSeries = Array.isArray(seriesConfigs) && seriesConfigs.length > 1;
      const keysToRender = [];
      const configuredValueFields = [
        ...(Array.isArray(cfg.valueFields) ? cfg.valueFields : []),
        ...(Array.isArray(seriesConfigs)
          ? seriesConfigs.flatMap((s) => Array.isArray(s.valueFields) ? s.valueFields : [])
          : []),
      ];
      const isPaymentTypeField = (field) => {
        const normalized = String(field || '').trim();
        const restored = normalized.replace(/__DOT__/g, '.').replace(/__SER__/g, '::');
        const lastPathPart = restored.split('::').pop().split('.').pop();
        return (
          restored === 'data.param14' ||
          restored.endsWith('.param14') ||
          lastPathPart === 'param14'
        );
      };
      seriesConfigs.forEach(s => {
        const fields = Array.isArray(s.valueFields) ? s.valueFields : [];
        if (multiSeries) {
          fields.forEach(vf => keysToRender.push(sanitize(`${s.id}::${vf}`)));
        } else {
          if (fields.length === 1) {
            keysToRender.push('value');
          } else {
            // Single-series with many fields: use raw keys (legacy-compatible)
            fields.forEach(vf => keysToRender.push(vf));
          }
        }
      });
      const showPaymentTypeColumn =
        configuredValueFields.some(isPaymentTypeField) ||
        Object.entries(compLabelMap || {}).some(([key, label]) => (
          isPaymentTypeField(key) ||
          String(label || '').trim().toLowerCase().includes('тип оплаты')
        ));
      const paymentTypeAvailableInReport =
        showPaymentTypeColumn ||
        (Array.isArray(fieldOptions) ? fieldOptions : []).some((option) => (
          isPaymentTypeField(option?.path) ||
          String(option?.label || '').trim().toLowerCase().includes('тип оплаты')
        ));

      // подготовим processedData с индексами и числовыми значениями (чтобы Recharts корректно построил path)
      const processedData = (Array.isArray(chartData) ? chartData : []).map((pt, idx) => {
        const out = { ...pt, __i: idx };
        keysToRender.forEach(k => {
          out[k] = Number(pt[k]) || 0;
        });
        return out;
      });

      const openBreakdownModal = (payload, dataKey) => {
        const rows = payload?.__breakdown?.[dataKey] || [];
        const label = compLabelMap?.[dataKey] || dataKey;
        const hasPaymentTypeRows = rows.some((row) => String(row.paymentType || '').trim());
        const rowsTotal = rows.reduce((sum, row) => sum + (Number(row.value) || 0), 0);
        setSelectedBreakdown({
          date: payload?.date || '',
          label,
          value: Number(payload?.[dataKey]) || 0,
          rowsTotal,
          hasPaymentType: showPaymentTypeColumn || (paymentTypeAvailableInReport && hasPaymentTypeRows) || (cfg?.endpoint === 'orderConfigs' && hasPaymentTypeRows),
          rows,
        });
      };

      const escapeExcelValue = (value) => String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

      const getReportExportTitle = (breakdown) => {
        const baseLabel = String(breakdown?.label || 'Отчет')
          .replace(/\s*[—-]\s*.*$/, '')
          .replace(/\s*\([^)]*\)\s*/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        return `Отчет ${baseLabel || 'Дашборд'} - ${breakdown?.date || ''}`.trim();
      };

      const sanitizeExportFileName = (name) => String(name || 'dashboard-report')
        .replace(/[\\/:*?"<>|]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      const exportBreakdownToExcel = (breakdown) => {
        if (!breakdown?.rows?.length) return;

        const title = getReportExportTitle(breakdown);
        const headers = ['№', 'Адрес', 'Изделие'];
        if (breakdown.hasPaymentType) headers.push('Тип оплаты');
        headers.push('Сумма');

        const rowsHtml = breakdown.rows.map((row, idx) => {
          const cells = [
            idx + 1,
            row.address,
            row.product,
          ];
          if (breakdown.hasPaymentType) {
            cells.push(paylistMap[String(row.paymentType)] || row.paymentType || '—');
          }
          cells.push(Number(row.value) || 0);

          return `<tr>${cells.map((cell, cellIdx) => {
            const align = cellIdx === cells.length - 1 ? 'right' : 'left';
            return `<td style="border:1px solid #d1d5db;padding:6px;text-align:${align};vertical-align:top;">${escapeExcelValue(cell)}</td>`;
          }).join('')}</tr>`;
        }).join('');

        const html = `
          <html>
            <head>
              <meta charset="UTF-8" />
            </head>
            <body>
              <h2>${escapeExcelValue(title)}</h2>
              <div>${escapeExcelValue(breakdown.label || '')}</div>
              <div>Итого: ${escapeExcelValue(formatDashboardNumber(breakdown.value))}</div>
              <br />
              <table style="border-collapse:collapse;">
                <thead>
                  <tr>
                    ${headers.map(header => `<th style="border:1px solid #d1d5db;background:#f3f4f6;padding:6px;text-align:left;">${escapeExcelValue(header)}</th>`).join('')}
                  </tr>
                </thead>
                <tbody>
                  ${rowsHtml}
                  <tr>
                    <td colspan="${headers.length - 1}" style="border:1px solid #d1d5db;padding:6px;text-align:right;font-weight:bold;">Итого</td>
                    <td style="border:1px solid #d1d5db;padding:6px;text-align:right;font-weight:bold;">${escapeExcelValue(formatDashboardNumber(breakdown.rowsTotal ?? breakdown.value))}</td>
                  </tr>
                </tbody>
              </table>
            </body>
          </html>
        `;

        const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${sanitizeExportFileName(title)}.xls`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
      };

      const renderClickableDot = (dataKey, radius) => function ClickableBreakdownDot(props) {
        const { cx, cy, stroke, payload } = props;
        if (cx == null || cy == null) return null;
        return (
          <circle
            cx={cx}
            cy={cy}
            r={radius}
            fill={stroke}
            stroke={stroke}
            strokeWidth={1}
            style={{ cursor: 'pointer' }}
            onClick={(e) => {
              e.stopPropagation();
              openBreakdownModal(payload, dataKey);
            }}
          />
        );
      };

      // если ещё не измерились — рендерим пустой контейнер
      if (!size.width || !size.height) {
        return <div ref={wrapperRef} style={{ width: '100%', height: '100%' }} />;
      }

      return (
        <div ref={wrapperRef} style={{ width: '100%', height: '100%' }}>
          <LineChart
            width={size.width}
            height={size.height}
            data={processedData}
            margin={{ top: 20, right: 30, left: 0, bottom: 0 }}
            key={`${mountedAt}-${size.width}x${size.height}-${processedData.length}`}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="__i"
              type="number"
              domain={[0, Math.max(0, processedData.length - 1)]}
              tickFormatter={(i) => {
                const p = processedData[i];
                return p ? p.date : '';
              }}
            />
            <YAxis allowDecimals={false} width={80} domain={['auto', 'auto']} />
            <Tooltip
              labelFormatter={i => {
                const p = processedData[i];
                return p ? p.date : '';
              }}
              formatter={(value, name) => [value, compLabelMap?.[name] || name]}
            />
            {keysToRender.length > 1 && <Legend />}

            {keysToRender.map((k, i) => {
              const name = compLabelMap?.[k] || (() => {
                if (!multiSeries) {
                  const firstSeries = seriesConfigs?.[0] || {};
                  const fields = Array.isArray(firstSeries.valueFields) ? firstSeries.valueFields : [];
                  if (fields.length === 1) {
                    const firstField = fields[0];
                    const fieldLabel = firstField
                      ? (fieldOptions.find(o => o.path === firstField)?.label || firstField)
                      : (cfg?.label || 'Серия');
                    return firstSeries?.label ? `${firstSeries.label} — ${fieldLabel}` : fieldLabel;
                  }
                  const fieldLabel = fieldOptions.find(o => o.path === k)?.label || k;
                  return firstSeries?.label ? `${firstSeries.label} — ${fieldLabel}` : fieldLabel;
                }
                const parts = k.split('__SER__');
                const sid = parts[0];
                const vf = parts.slice(1).join('__SER__').replace(/__DOT__/g, '.');
                const s = (seriesConfigs || []).find(x => x.id === sid);
                const fieldLabel = fieldOptions.find(o => o.path === vf)?.label || vf;
                return s ? `${s.label} — ${fieldLabel}` : fieldLabel;
              })();
              return (
                <Line
                  key={k}
                  type="monotone"
                  dataKey={k}
                  name={name}
                  stroke={palette[i % palette.length]}
                  strokeWidth={3}
                  dot={renderClickableDot(k, 3)}
                  activeDot={renderClickableDot(k, 5)}
                  isAnimationActive={false}
                  animationDuration={0}
                />
              );
            })}
          </LineChart>
          {selectedBreakdown && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
              onClick={() => setSelectedBreakdown(null)}
            >
              <div
                className="flex max-h-[85vh] w-full max-w-4xl flex-col rounded bg-white shadow-xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-5 py-4">
                  <div>
                    <div className="text-lg font-semibold text-gray-900">{selectedBreakdown.date}</div>
                    <div className="mt-1 text-sm text-gray-600">{selectedBreakdown.label}</div>
                    <div className="mt-2 text-base font-semibold text-gray-900">
                      Итого: {formatDashboardNumber(selectedBreakdown.value)}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      className="rounded border border-gray-300 bg-white px-3 py-1 text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                      onClick={() => exportBreakdownToExcel(selectedBreakdown)}
                      disabled={!selectedBreakdown.rows.length}
                    >
                      Выгрузить
                    </button>
                    <button
                      type="button"
                      className="rounded border border-gray-300 bg-white px-3 py-1 text-sm text-gray-700 hover:bg-gray-50"
                      onClick={() => setSelectedBreakdown(null)}
                    >
                      Закрыть
                    </button>
                  </div>
                </div>

                <div className="min-h-0 overflow-y-auto px-5 py-4">
                  {selectedBreakdown.rows.length > 0 ? (
                    <div className="overflow-hidden rounded border border-gray-200">
                      <table className="w-full table-fixed border-collapse text-sm">
                        <colgroup>
                          <col className="w-11" />
                          <col className={selectedBreakdown.hasPaymentType ? 'w-[22%]' : 'w-[28%]'} />
                          <col className={selectedBreakdown.hasPaymentType ? 'w-[40%]' : 'w-[46%]'} />
                          {selectedBreakdown.hasPaymentType && <col className="w-[10%]" />}
                          <col className="w-[120px]" />
                        </colgroup>
                        <thead className="bg-gray-50 text-xs font-semibold uppercase text-gray-500">
                          <tr>
                            <th className="px-3 py-2 text-left font-semibold">№</th>
                            <th className="px-3 py-2 text-left font-semibold">Адрес</th>
                            <th className="px-3 py-2 text-left font-semibold">Изделие</th>
                            {selectedBreakdown.hasPaymentType && (
                              <th className="px-3 py-2 text-left font-semibold">Тип оплаты</th>
                            )}
                            <th className="px-3 py-2 text-right font-semibold">Сумма</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {selectedBreakdown.rows.map((row, idx) => (
                            <tr key={`${row.orderId || 'order'}-${idx}`}>
                              <td className="px-3 py-1.5 align-top text-gray-500 tabular-nums">{idx + 1}</td>
                              <td className="break-words px-3 py-1.5 align-top leading-snug text-gray-900">
                                {row.address}
                              </td>
                              <td className="break-words px-3 py-1.5 align-top leading-snug text-gray-900">
                                {row.product}
                              </td>
                              {selectedBreakdown.hasPaymentType && (
                                <td className="break-words px-3 py-1.5 align-top leading-snug text-gray-900">
                                  {paylistMap[String(row.paymentType)] || row.paymentType || '—'}
                                </td>
                              )}
                              <td className="whitespace-nowrap px-3 py-1.5 text-right align-top font-semibold text-gray-900 tabular-nums">
                                {formatDashboardNumber(row.value)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="rounded border border-gray-200 bg-gray-50 px-4 py-6 text-center text-sm text-gray-600">
                      Для этой точки нет строк расшифровки.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      );
    }
  }


  // В итоге проверяем старый это график или уже с мульти сериями
  const rawSeries = Array.isArray(cfg?.series) ? cfg.series : [];
  const renderIsLegacy = rawSeries.length === 0;



  if (loading) {
    return <Spinner />;
  }

  return (

    <div className="p-6">
      <h1 className="text-2xl font-semibold mb-4">Дашборд отчётов</h1>

      {/* Табуляция */}
      <div className="flex gap-2 mb-4">
        {sortedConfigs.map((c) => {
          const isActive = activeTab === c.key;
          return (
            <button
              key={c.key}
              onClick={() => setActiveTab(c.key)}
              className="px-4 py-2 rounded text-white transition-opacity"
              style={{
                backgroundColor: c.color,           // ваш цвет
                opacity: isActive ? 1 : 0.7,        // чуть полупрозрачный, если не выбран
                border: isActive ? '3px solid black' : 'none',
              }}
            >
              {c.label}
            </button>
          );
        })}
      </div>

      {/* Контролы периода и гранулярности */}
      {cfg && <ChartControls />}

      
      {/* График — ChartWithMeasuredSize это серии, LEgacy это старый вариант */}
      {cfg && (
        <div className="w-full h-96 bg-white rounded shadow p-4">
          {!renderIsLegacy ? (
          <ChartWithMeasuredSize
            chartData={chartData}
            cfg={cfg}
            fieldOptions={fieldOptions}
            compLabelMap={compLabelMap}
            paylistMap={paylistMap}
          />
          ) : (            
            // === LEGACY: прежний блок, без изменений ===
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top:20, right:30, left:0, bottom:0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis
                  allowDecimals={false}
                  width={80}
                  domain={[
                    dataMin => Math.min(dataMin, cfg.refNumber ?? dataMin, cfg.refNumberWeek ?? dataMin),
                    dataMax => Math.max(dataMax, cfg.refNumber ?? dataMax, cfg.refNumberWeek ?? dataMax),
                  ]}
                />
                <Tooltip />
                {cfg.valueFields.length > 1 && <Legend />}

                {/* ReferenceLine как было раньше */}
                {(() => {
                  // console.log('код LEGACY')
                  const refY = granularity === 'day' ? cfg.refNumber : cfg.refNumberWeek;
                  if (refY != null) {
                    return (
                      <ReferenceLine
                        y={refY}
                        stroke="red"
                        strokeDasharray="4 4"
                        label={{
                          position: 'right',
                          value: granularity === 'day' ? `Ref день ${refY}` : `Ref неделя ${refY}`,
                          fill: 'red',
                          fontSize: 12,
                        }}
                      />
                    );
                  }
                  return null;
                })()}

                {cfg.valueFields.length === 1 ? (
                  <Line
                    type="monotone"
                    dataKey="value"
                    name={ fieldOptions.find(o => o.path === cfg.dateField)?.label || cfg.label }
                    stroke="#3182ce"
                    strokeWidth={3}
                    dot={{ r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                ) : (
                  cfg.valueFields.map((f, i) => {
                    const opt = fieldOptions.find(o => o.path === f);
                    return (
                      <Line
                        key={f}
                        type="monotone"
                        dataKey={f}
                        name={opt?.label || f}
                        stroke={['#3182ce','#10b981','#f97316','#ef4444','#6366f1'][i % 5]}
                        strokeWidth={2}
                        dot={{ r: 3 }}
                        activeDot={{ r: 5 }}
                      />
                    );
                  })
                )}
              </LineChart>
            </ResponsiveContainer>
            // === end LEGACY ===
          )}
        </div>
      )}
    </div>
  );
}

