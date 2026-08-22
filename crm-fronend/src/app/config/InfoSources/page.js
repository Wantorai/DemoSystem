// app/config/InfoSources.js

'use client';  // Это директива, чтобы компонент стал клиентским

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'react-toastify';

export default function AddInfoSourceForm() {
    const [name, setName] = useState('');
    const [infoSources, setInfoSources] = useState([]); // Изначально массив
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const router = useRouter();

    useEffect(() => {
        const fetchInfoSources = async () => {
            try {
                const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/infoSources`);
                if (!response.ok) {
                    throw new Error('Failed to fetch infoSources');
                }
                const data = await response.json();
                if (Array.isArray(data)) {
                    setInfoSources(data); // Убедитесь, что это массив
                } else {
                    setInfoSources([]); // Если это не массив, сбросьте до пустого
                }
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        fetchInfoSources();
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();

        const infoSourceData = { name };

        try {
            const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/infoSources`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(infoSourceData),
            });

            if (response.ok) {
                const result = await response.json();
                // console.log('InfoSource added:', result);
                //toast('InfoSource successfully added!');

                // Добавляем новое поле в существующий массив
                setInfoSources((prevInfoSources) => [...prevInfoSources, result]);

                setName(''); // Очищаем ввод после добавления
            } else {
                const errorData = await response.json();
                console.error('Error adding InfoSource:', errorData);
                toast(`Error: ${errorData.error}`);
            }
        } catch (error) {
            console.error('Network error:', error);
            toast('Network error. Please try again.');
        }
    };

    const handleInfoSourceClick = (id) => {
        router.push(`/infoSource/${id}`); // Переход на страницу поля по id
    };

    return (
        <div>
            <div>
                <h3>Добавить</h3>
                <form onSubmit={handleSubmit}>
                    <div className="details">
                        <div className="detail-row">
                            <label className="labelClient">Название: </label>
                            <input
                                className="valueClient"
                                type="text"
                                placeholder=""
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                required
                            />
                            <p></p>
                        </div>
                    </div>
                    <button type="submit">Сохранить</button>
                </form>
            </div>
            <br />
            <br />
            <hr></hr>
            <br />
            <div>
                <h3>Список</h3>
                {loading ? (
                    <p>Загрузка...</p>
                ) : error ? (
                    <p style={{ color: 'red' }}>Ошибка: {error}</p>
                ) : (
                    <table className="tasks">
                        <thead>
                            <tr>
                                <th>Название</th>
                            </tr>
                        </thead>
                        <tbody>
                            {infoSources.map((infoSource) => (
                                <tr
                                    key={infoSource.id}
                                    onClick={() => handleInfoSourceClick(infoSource.id)}
                                    style={{ cursor: 'pointer' }}
                                >
                                    <td>{infoSource.name}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
