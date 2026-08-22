'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { toast } from 'react-toastify';

const PaylistPage = () => {
    const router = useRouter();
    const params = useParams();
    const [paylist, setPaylist] = useState(null);
    const [name, setName] = useState('');


    useEffect(() => {
        if (!params?.id) return;

        const fetchPaylist = async () => {
            try {
                const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/paylists/${params.id}`);
                if (!response.ok) throw new Error('Ошибка загрузки данных типа оплат');

                const data = await response.json();
                setPaylist(data);
                setName(data.name);
            } catch (error) {
                console.error('Error fetching paylist:', error);
            }
        };

        fetchPaylist();
    }, [params?.id]);

    const handleUpdate = async () => {
        try {
            const updatedPaylist = { name };

            const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/paylists/${params.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(updatedPaylist),
            });

            if (response.ok) {
                //toast('Тип оплаты успешно обновлен!');
            } else {
                throw new Error('Ошибка при обновлении типа оплаты');
            }
        } catch (error) {
            console.error(error);
            toast('Не удалось обновить тип оплаты.');
        }
    };

    const handleDelete = async () => {
        try {
            const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/paylists/${params.id}`, {
                method: 'DELETE',
            });

            if (response.ok) {
                router.push('/config/Paylists');
            } else {
                throw new Error('Ошибка при удалении типа оплаты');
            }
        } catch (error) {
            console.error(error);
            toast('Не удалось удалить тип оплаты.');
        }
    };

    if (!paylist) return <p>Загрузка...</p>;

    return (
        <div className="details">
            <h1>{paylist.name}</h1>
            <div className="detail-row"> 
                <span className="labelClient">Название:</span>
                <input className="valueClient"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                />
            </div>

            <button onClick={handleUpdate}>Сохранить</button>
            <button onClick={handleDelete}>Удалить</button>
            <button onClick={() => router.push('/config/Paylists')}>Весь список</button>
        </div>
    );
};

export default PaylistPage;
