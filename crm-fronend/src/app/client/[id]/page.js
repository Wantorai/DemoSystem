'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { toast } from 'react-toastify';
import { useMask } from '../../../components/MaskContext';

const ClientPage = () => {
    const router = useRouter();
    const params = useParams();
    const [client, setClient] = useState(null);
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [representative, setRepresentative] = useState('');
    const [representativePhone, setRepresentativePhone] = useState('');
    const { isMasked } = useMask();

    useEffect(() => {
        if (!params?.id) return;

        const fetchClient = async () => {
            try {
                const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/clients/${params.id}`);
                if (!response.ok) throw new Error('Ошибка загрузки данных клиента');

                const data = await response.json();
                setClient(data);
                setName(data.name);
                setEmail(data.email);
                setPhone(data.phone);
                setRepresentative(data.representative)
                setRepresentativePhone(data.representativePhone)
            } catch (error) {
                console.error('Error fetching client:', error);
            }
        };

        fetchClient();
    }, [params?.id]);

    const handleUpdate = async () => {
        try {
            const updatedClient = { name, email, phone };

            const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/clients/${params.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(updatedClient),
            });

            if (response.ok) {
                toast('Клиент успешно обновлен!');
            } else {
                throw new Error('Ошибка при обновлении клиента');
            }
        } catch (error) {
            console.error(error);
            toast('Не удалось обновить клиента.');
        }
    };

    const handleDelete = async () => {
        try {
            const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/clients/${params.id}`, {
                method: 'DELETE',
            });

            if (response.ok) {
                router.push('/clients');
            } else {
                throw new Error('Ошибка при удалении клиента');
            }
        } catch (error) {
            console.error(error);
            toast('Не удалось удалить клиента.');
        }
    };


    const maskText = (text, visibleChars = 3) => {
        if (!text || typeof text !== 'string') return text;
        if (text.length <= visibleChars) return '*'.repeat(text.length);
        return text.slice(0, visibleChars) + '*'.repeat(text.length - visibleChars);
    };

    if (!client) return <p className="p-4">Загрузка...</p>;

    return (
        <div className="client-page px-3 pb-6 pt-3 sm:px-4">
        <div className="details client-edit-card mx-auto max-w-2xl rounded-lg border border-gray-200 bg-white p-4 shadow-lg sm:p-6">
            <h1 className="break-words text-2xl sm:text-3xl">{client.name}</h1>
            <div className="detail-row"> 
                <span className="labelClient">Имя:</span>
                <input className="valueClient"
                    type="text"
                    value={isMasked ? maskText(name) : name}
                    onChange={(e) => setName(e.target.value)}
                />
            </div>
            <div className="detail-row">
                <span className="labelClient">Телефон:</span>
                <input className="valueClient"
                    type="text"
                    value={isMasked ? maskText(phone) : phone}
                    onChange={(e) => setPhone(e.target.value)}
                />
            </div>
            <div className="detail-row">
                <span className="labelClient">Email:</span>
                <input className="valueClient"
                    type="email"
                    value={isMasked ? maskText(email || "") : (email || "")}
                    onChange={(e) => setEmail(e.target.value)}
                />
            </div>
            <div className="detail-row">
                <span className="labelClient">Представитель:</span>
                <input className="valueClient"
                    type="text"
                    value={isMasked ? maskText(representative || "") : (representative || "")}
                    onChange={(e) => setRepresentative(e.target.value)}
                />
            </div>
            <div className="detail-row">
                <span className="labelClient">Телефон:</span>
                <input className="valueClient"
                    type="text"
                    value={isMasked ? maskText(representativePhone || "") : (representativePhone || "")}
                    onChange={(e) => setRepresentativePhone(e.target.value)}
                />
            </div>
            <div className="client-edit-actions mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <button onClick={handleUpdate}>Сохранить</button>
                <button onClick={handleDelete} className="bg-red-500 hover:bg-red-600">Удалить</button>
                <button onClick={() => router.push('/clients')} className="bg-gray-500 hover:bg-gray-600">Весь список</button>
            </div>
        </div>
        </div>
    );
};

export default ClientPage;
