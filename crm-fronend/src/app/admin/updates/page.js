'use client';

import { useEffect, useState } from 'react';
import Spinner from "../../../components/Spinner";

export default function UpdatesPage() {
  const [versions, setVersions] = useState(null);
  const [logs, setLogs] = useState('');
  const [loadingTarget, setLoadingTarget] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchVersions = async () => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/system/version`);
      const data = await res.json();
      setVersions(data);
    } catch (error) {
      console.error('Ошибка при получении версий:', error);
    } finally {
        setLoading(false);
      }
  };

  // useEffect(() => {
  //   console.log('Версии:', versions);
  // }, [versions]);

  // useEffect(() => {
  //   console.log(versions?.current?.dependencies); // Логируем зависимости
  // }, [versions]);

  const fetchLogs = async () => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/system/logs`);
      const text = await res.text();
      setLogs(text);
    } catch (error) {
      console.error('Ошибка при получении логов:', error);
    }
  };



  const handleUpdate = async (target) => {
    setLoadingTarget(target);
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/system/update/${target}`, { method: 'POST' });
      await fetchVersions();
      await fetchLogs();
    } catch (error) {
      console.error(`Ошибка при обновлении ${target}:`, error);
    }
    setLoadingTarget(null);
  };

  useEffect(() => {
    fetchVersions();
    fetchLogs();
  }, []);

  if (loading) {
    return <Spinner />;
  }



  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Обновления системы</h1>

      <div className="border rounded shadow p-4 space-y-4 bg-white">
        {versions && (
          <>
            <div className="flex justify-between items-center">
              <div>
                <strong>PostgreSQL:</strong> {versions.current.postgres}
              </div>
              <button
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                onClick={() => handleUpdate('postgres')}
                disabled={loadingTarget === 'postgres'}
              >
                {loadingTarget === 'postgres' ? 'Обновляется...' : 'Обновить PostgreSQL'}
              </button>
            </div>    



            <div className="flex justify-between items-center">
              <div>
              <strong>Node.js:</strong> {versions?.current.node || 'Не определено'}
              </div>
              <button
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                onClick={() => handleUpdate('node')}
                disabled={loadingTarget === 'node'}
              >
                {loadingTarget === 'node' ? 'Обновляется...' : 'Обновить Node.js'}
              </button>
            </div>



            <div className="flex justify-between items-center">
              <div>
                <strong>Next.js:</strong>
                <span className="ml-2 text-sm bg-gray-100 px-2 py-1 rounded">
                  {versions.current.nextJs}
                </span>
                <button className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Обновляется вместе с зависимостями</button>
              </div>
            </div>

            <div className="flex justify-between items-start">
                <div>
                    <strong>Зависимости:</strong>
                    {versions?.current?.backendDependencies && versions?.current?.frontendDependencies ? (
                    // <ul className="mt-1 text-sm list-disc pl-5">
                    //     {/* Объединение зависимостей */}
                    //     {[...versions.current.backendDependencies, ...versions.current.frontendDependencies].map((dep) => (
                    //     <li key={dep.name}>
                    //         {dep.name}: <strong>{dep.current}</strong> → <strong>{dep.latest}</strong>
                    //     </li>
                    //     ))}
                    // </ul>
                    <ul className="mt-1 text-sm list-disc pl-5">
                      {[
                        ...versions.current.backendDependencies.map(dep => ({ ...dep, _source: 'backend' })),
                        ...versions.current.frontendDependencies.map(dep => ({ ...dep, _source: 'frontend' }))
                      ].map((dep) => (
                        <li key={`${dep._source}:${dep.name}`}>
                          {dep.name}: <strong>{dep.current}</strong> → <strong>{dep.latest}</strong>
                        </li>
                      ))}
                    </ul>

                    ) : (
                    <span className="ml-2 text-green-600">все актуальны</span>
                    )}
                </div>
                <button
                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                    onClick={() => handleUpdate('dependencies')}
                    disabled={loadingTarget === 'dependencies'}
                >
                    {loadingTarget === 'dependencies' ? 'Обновляется...' : 'Обновить зависимости'}
                </button>
                </div>


          </>
        )}
      </div>

      <div className="border rounded shadow p-4 bg-white">
        <h2 className="text-lg font-semibold mb-2">Логи обновлений</h2>
        <pre className="text-sm bg-gray-100 p-4 rounded max-h-[300px] overflow-auto whitespace-pre-wrap">
          {logs || 'Нет логов'}
        </pre>
      </div>
    </div>
  );
}
