'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { toast } from 'react-toastify';

const FieldPage = () => {
    const router = useRouter();
    const params = useParams();
    const [field, setField] = useState(null);
    const [name, setName] = useState('');


    useEffect(() => {
        if (!params?.id) return;

        const fetchField = async () => {
            try {
                const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/fields/${params.id}`);
                if (!response.ok) throw new Error('Ошибка загрузки данных поля');

                const data = await response.json();
                setField(data);
                setName(data.name);
            } catch (error) {
                console.error('Error fetching field:', error);
            }
        };

        fetchField();
    }, [params?.id]);

    const handleUpdate = async () => {
        try {
            const updatedField = { name };

            const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/fields/${params.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(updatedField),
            });

            if (response.ok) {
                //toast('Поле успешно обновлено!');
            } else {
                throw new Error('Ошибка при обновлении поля');
            }
        } catch (error) {
            console.error(error);
            toast('Не удалось обновить поле.');
        }
    };

    const handleDelete = async () => {
        try {
            const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/fields/${params.id}`, {
                method: 'DELETE',
            });

            if (response.ok) {
                router.push('/config/Fields');
            } else {
                throw new Error('Ошибка при удалении поля');
            }
        } catch (error) {
            console.error(error);
            toast('Не удалось удалить поле.');
        }
    };

    if (!field) return <p>Загрузка...</p>;

    return (
        <div className="details">
            <h1>{field.name}</h1>
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
            <button onClick={() => router.push('/config/Fields')}>Весь список</button>
        </div>
    );
};

export default FieldPage;
