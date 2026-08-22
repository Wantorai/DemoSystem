'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { toast } from 'react-toastify';

const FurnVendorPage = () => {
    const router = useRouter();
    const params = useParams();
    const [furnVendor, setFurnVendor] = useState(null);
    const [name, setName] = useState('');


    useEffect(() => {
        if (!params?.id) return;

        const fetchFurnVendor = async () => {
            try {
                const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/furnVendors/${params.id}`);
                if (!response.ok) throw new Error('Ошибка загрузки данных поставщикя');

                const data = await response.json();
                setFurnVendor(data);
                setName(data.name);
            } catch (error) {
                console.error('Error fetching furnVendor:', error);
            }
        };

        fetchFurnVendor();
    }, [params?.id]);

    const handleUpdate = async () => {
        try {
            const updatedFurnVendor = { name };

            const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/furnVendors/${params.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(updatedFurnVendor),
            });

            if (response.ok) {
                toast('Поле успешно обновлено!');
            } else {
                throw new Error('Ошибка при обновлении поставщикя');
            }
        } catch (error) {
            console.error(error);
            toast('Не удалось обновить поставщике.');
        }
    };

    const handleDelete = async () => {
        try {
            const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/furnVendors/${params.id}`, {
                method: 'DELETE',
            });

            if (response.ok) {
                router.push('/config/FurnVendors');
            } else {
                throw new Error('Ошибка при удалении поставщикя');
            }
        } catch (error) {
            console.error(error);
            toast('Не удалось удалить поставщике.');
        }
    };

    if (!furnVendor) return <p>Загрузка...</p>;

    return (
        <div className="details">
            <h1>{furnVendor.name}</h1>
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
            <button onClick={() => router.push('/config/FurnVendors')}>Весь список</button>
        </div>
    );
};

export default FurnVendorPage;
