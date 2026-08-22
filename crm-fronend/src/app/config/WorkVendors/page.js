// app/config/WorkVendors.js

'use client';  // Это директива, чтобы компонент стал клиентским

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'react-toastify';

export default function AddWorkVendorForm() {
    const [name, setName] = useState('');
    const [workVendors, setWorkVendors] = useState([]); // Изначально массив
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const router = useRouter();

    useEffect(() => {
        const fetchWorkVendors = async () => {
            try {
                const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/workVendors`);
                if (!response.ok) {
                    throw new Error('Failed to fetch workVendors');
                }
                const data = await response.json();
                if (Array.isArray(data)) {
                    setWorkVendors(data); // Убедитесь, что это массив
                } else {
                    setWorkVendors([]); // Если это не массив, сбросьте до пустого
                }
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        fetchWorkVendors();
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();

        const workVendorData = { name };

        try {
            const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/workVendors`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(workVendorData),
            });

            if (response.ok) {
                const result = await response.json();
                // console.log('WorkVendor added:', result);
                // toast('WorkVendor successfully added!');

                // Добавляем нового поставщика в существующий массив
                setWorkVendors((prevWorkVendors) => [...prevWorkVendors, result]);

                setName(''); // Очищаем ввод после добавления
            } else {
                const errorData = await response.json();
                console.error('Error adding WorkVendor:', errorData);
                toast(`Error: ${errorData.error}`);
            }
        } catch (error) {
            console.error('Network error:', error);
            toast('Network error. Please try again.');
        }
    };

    const handleWorkVendorClick = (id) => {
        router.push(`/workVendor/${id}`); // Переход на страницу поля по id
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
                            {workVendors.map((workVendor) => (
                                <tr
                                    key={workVendor.id}
                                    onClick={() => handleWorkVendorClick(workVendor.id)}
                                    style={{ cursor: 'pointer' }}
                                >
                                    <td>{workVendor.name}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
