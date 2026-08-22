'use client';

import React, { useEffect, useState, useContext, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { AuthContext } from "../../context/AuthContext";
import useUnreadSupportTickets from '../../hooks/useUnreadSupportTickets';
import { translate } from '../../i18n/translations';

function normalizeHost(host) {
  return String(host || '').trim().toLowerCase().replace(/^www\./, '');
}

function getConfiguredSupportHost() {
  try {
    return normalizeHost(new URL(process.env.STATIC_BASE_URL).hostname);
  } catch {
    return '';
  }
}

const configuredSupportHost = getConfiguredSupportHost();

const AllConfig = () => {
  const [links, setLinks] = useState([]);
  const { user, token } = useContext(AuthContext);
  const unreadTicketCount = useUnreadSupportTickets(token);
  const [sys, setSys] = useState(null);
  const [sysError, setSysError] = useState(null); // для ошибок
  const isMainSupportHost = useSyncExternalStore(
    () => () => {},
    () => {
      const currentHost = normalizeHost(window.location.hostname);
      return (
        (Boolean(configuredSupportHost) && currentHost === configuredSupportHost) ||
        process.env.NODE_ENV === 'development'
      );
    },
    () => false
  );

  // var currentRoleId;
  // // var cuurentUserId;
  // if (user) {
  //   currentRoleId = user.roleId; // Получаем роль юзера)
  //   // cuurentUserId = user.id; // Получаем id юзера
  // } 

  // Загрузка системных данных при монтировании
  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/system/system-info`)
      .then(res => res.json())
      .then(data => {
        if (data.error) {
          // обработка ошибки
          console.error('Ошибка системных данных:', data.error);
          setSysError(data.error);
          setSys(null);
        } else {
          setSys(data);
          setSysError(null);
          // checkDiskAlert(data);
        }
      })
      .catch(err => {
        console.error('Ошибка запроса системных данных:', err);
        setSysError(err.message);
        setSys(null);
      });
  }, []);



  useEffect(() => {
    if (user) {
      const roleId = user.roleId;
  
      fetch(`${process.env.NEXT_PUBLIC_API_URL}/config-links?roleId=${roleId}`)
        .then((res) => {
          if (!res.ok) {
            throw new Error(`Ошибка: ${res.status} - ${res.statusText}`);
          }
          return res.json();
        })
        .then((data) => {
          // Сортируем данные по id после загрузки

          const sortedData = data.sort((a, b) => a.label.localeCompare(b.label));
          setLinks(sortedData);
        })
        .catch((err) => console.error('Ошибка загрузки конфигурации:', err));
    }
  }, [user]);



  

  return (
    <div className="min-h-screen bg-gray-100 py-8">
      <div className="max-w-3xl mx-auto bg-white shadow-lg rounded-xl p-8">


      {/* ==== Системная панель ==== */}
      {sysError ? (
          <div className="mb-8 p-4 bg-red-100 text-red-800 rounded">
            <strong>Ошибка получения системных данных:</strong>
            <pre className="whitespace-pre-wrap">{sysError}</pre>
          </div>
        ) : sys ? (
        <div className="mb-8 p-4 bg-gray-50 rounded">
          {/* <h2 className="text-xl font-semibold mb-2">Системная информация</h2> */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">

            {/* CPU */}
            <div>
              <p>
                <strong>CPU:</strong>{' '}
                {sys.cpu?.usagePercent != null ? `${sys.cpu.usagePercent}%` : '—'}{' '}
                (ср. за 1м: {sys.cpu?.loadAvg1m ?? '—'})
              </p>
              <p>Ядер: {sys.cpu?.cores ?? '—'}</p>
            </div>

            {/* Память */}
            <div>
              <p>
                <strong>Память:</strong>{' '}
                {sys.memory != null
                  ? `${(sys.memory.used / 1024 / 1024).toFixed(0)} MB из ${(sys.memory.total / 1024 / 1024).toFixed(0)} MB`
                  : '—'}
              </p>
              <p>
                Использовано:{' '}
                {sys.memory?.usagePercent != null ? `${sys.memory.usagePercent}%` : '—'}
              </p>
            </div>

            {/* Диск */}
            <div>
              <p>
                <strong>Диск (/):</strong>{' '}
                {sys.disk
                  ? `${sys.disk.used} / ${sys.disk.total}`
                  : '—'}
              </p>
              <p>
                Свободно:{' '}
                {sys.disk
                  ? `${sys.disk.available} (${100 - parseInt(sys.disk.usagePercent)}%)`
                  : '—'}
              </p>
            </div>

          </div>
        </div>
      ) : (
        <p>Загрузка системных данных…</p>
      )}



        <h1 className="text-3xl font-bold mb-8 text-center">Конфигурации</h1>
        {isMainSupportHost && <div className="mb-4">
          <Link
            href="/admin/support-tickets"
            className="os-primary-bg flex items-center justify-between px-6 py-3 text-white font-semibold rounded transition duration-200"
          >
            <span>Тикеты поддержки</span>
            {unreadTicketCount > 0 && (
              <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-bold text-white">
                {unreadTicketCount > 99 ? '99+' : unreadTicketCount}
              </span>
            )}
          </Link>
        </div>}
        {isMainSupportHost && <div className="mb-4">
          <Link
            href="/config/mobile-diagnostics"
            className="block px-6 py-3 bg-slate-800 text-white font-semibold rounded hover:bg-slate-700 transition duration-200"
          >
            Диагностика мобильных приложений
          </Link>
        </div>}
        {isMainSupportHost && <div className="mb-4">
          <Link
            href="/config/social-deploy"
            className="block px-6 py-3 bg-cyan-600 text-white font-semibold rounded hover:bg-cyan-700 transition duration-200"
          >
            Social Deploy
          </Link>
        </div>}        {isMainSupportHost && <div className="mb-4">
          <Link
            href="/config/3dscenes"
            className="block px-6 py-3 bg-emerald-700 text-white font-semibold rounded hover:bg-emerald-800 transition duration-200"
          >
            3D проекты
          </Link>
        </div>}
        <ol className="space-y-4">
        {links.map((link) => (
  link.label ? (
    <li key={link.id}>
      <Link
        href={link.path}
        className={`block px-6 py-3 text-white font-semibold rounded transition duration-200 ${link.style || 'bg-gray-500 hover:bg-gray-600'}`}
      >
        {translate(link.label)}
      </Link>
    </li>
  ) : null
))}

        </ol>
        <ul>
          <li>
            <Link
              href="/admin/allConfigs"
              className="block px-6 py-3 bg-red-500 text-white font-semibold rounded hover:bg-red-600 transition duration-200"
             >
               Конфигурация имен конфигураций
            </Link>
          </li>
        </ul>  
      </div>
    </div>
  );
};

export default AllConfig;





  // useEffect(() => {
  //   fetch(`${process.env.NEXT_PUBLIC_API_URL}/config-links`)
  //     .then((res) => res.json())
  //     .then((data) => {
  //       // Сортируем данные по id после загрузки
  //       const sortedData = data.sort((a, b) => a.id - b.id);
  //       setLinks(sortedData);
  //       // console.log('Полученные данные после сортировки:', sortedData);
  //     })
  //     .catch((err) => console.error('Ошибка загрузки конфигурации:', err));
  // }, []);

