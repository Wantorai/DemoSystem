// // app/clients/page.js

'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useMask } from '../../components/MaskContext';


export default function ClientsPage() {
    const [clients, setClients] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const router = useRouter();
    const [searchQuery, setSearchQuery] = useState(""); // Поисковый запрос
    const { isMasked } = useMask();

    useEffect(() => {
        const fetchClients = async () => {
            try {
                const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/clients`);
                if (!response.ok) {
                    throw new Error('Failed to fetch clients');
                }
                const data = await response.json();
                setClients(data);
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        fetchClients();
    }, []);



    // Поиск клиента по имени, телефону или email
    const searchClients = clients.filter(client => {
        // Ищем клиента по clientId
        // const client = clients.find(client => client.name === order.data.param1);
      
        return searchQuery
        ? ((client && client.name.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (client && client.phone.includes(searchQuery.toLowerCase()))
           )
        : true;
      }).sort((a, b) =>
        String(a?.name || '').localeCompare(String(b?.name || ''), 'ru', {
          sensitivity: 'base',
        })
      );


    const maskText = (text, visibleChars = 3) => {
    if (!text || typeof text !== 'string') return text;
    if (text.length <= visibleChars) return '*'.repeat(text.length);
    return text.slice(0, visibleChars) + '*'.repeat(text.length - visibleChars);
    };


    if (loading) {
        return <div>Loading...</div>;
    }

    if (error) {
        return <div>Error: {error}</div>;
    }

    const handleClientClick = (id) => {
        router.push(`/client/${id}`); // Переход на страницу клиента по id
    };

    return (
        <div className="clients-page px-3 pb-6 pt-3 sm:px-4">
            <div className="clients-toolbar mx-auto flex max-w-6xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="sm:w-1/3">
                <h1>Клиенты</h1>
            </div>
            <div className="w-full sm:w-1/3">
                <input
                type="text"
                placeholder="Поиск по имени или телефону..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="clients-search mx-auto block w-full rounded-md border border-gray-300 p-2 text-center"
                />
            </div>
            <div className="flex w-full justify-end sm:w-1/3">
                <button onClick={() => router.push('/clients/add')}>
                Добавить
                </button>
            </div>
            </div>


        {/* Таблица задач */}
        <div className="clients-table-wrap mx-auto mt-4 max-w-6xl overflow-x-auto rounded-lg border border-gray-200">
        <table className="tasks clients-table">
            <thead>
                <tr>
                    <th>Имя</th>
                    <th>Телефон</th>
                    <th>Email</th>
                    <th>Представитель</th>
                    <th>Телефон</th>
                </tr>
            </thead>
            <tbody>
                {searchClients.map((client) => (
                    <tr key={client.id} onClick={() => handleClientClick(client.id)} style={{ cursor: 'pointer' }}>
                        <td data-label="Имя">{isMasked ? maskText(client.name) : client.name}</td>
                        <td data-label="Телефон">{isMasked ? maskText(client.phone) : client.phone}</td>
                        <td data-label="Email">{isMasked ? maskText(client.email) : client.email}</td>
                        <td data-label="Представитель">{isMasked ? maskText(client.representative) : client.representative}</td>
                        <td data-label="Телефон представителя">{isMasked ? maskText(client.representativePhone) : client.representativePhone}</td>
                    </tr>
                ))}
            </tbody>
        </table>
        </div>
        </div>
    );
}
