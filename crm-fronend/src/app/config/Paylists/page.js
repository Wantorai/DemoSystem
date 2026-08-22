// app/config/Paylists.js

'use client';  // Это директива, чтобы компонент стал клиентским

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'react-toastify';

export default function AddPaylistForm() {
    const [name, setName] = useState('');
    const [paylists, setPaylists] = useState([]); // Изначально массив
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const router = useRouter();

    useEffect(() => {
        const fetchPaylists = async () => {
            try {
                const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/paylists`);
                if (!response.ok) {
                    throw new Error('Failed to fetch paylists');
                }
                const data = await response.json();
                if (Array.isArray(data)) {
                    setPaylists(data); // Убедитесь, что это массив
                } else {
                    setPaylists([]); // Если это не массив, сбросьте до пустого
                }
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        fetchPaylists();
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();

        const paylistData = { name };

        try {
            const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/paylists`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(paylistData),
            });

            if (response.ok) {
                const result = await response.json();
                // console.log('Paylist added:', result);
                //toast('Paylist successfully added!');

                // Добавляем новое поле в существующий массив
                setPaylists((prevPaylists) => [...prevPaylists, result]);

                setName(''); // Очищаем ввод после добавления
            } else {
                const errorData = await response.json();
                console.error('Error adding Paylist:', errorData);
                toast(`Error: ${errorData.error}`);
            }
        } catch (error) {
            console.error('Network error:', error);
            toast('Network error. Please try again.');
        }
    };

    const handlePaylistClick = (id) => {
        router.push(`/paylist/${id}`); // Переход на страницу поля по id
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
                            {paylists.map((paylist) => (
                                <tr
                                    key={paylist.id}
                                    onClick={() => handlePaylistClick(paylist.id)}
                                    style={{ cursor: 'pointer' }}
                                >
                                    <td>{paylist.name}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
