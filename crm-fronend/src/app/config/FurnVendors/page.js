// app/config/FurnVendors.js

'use client';  // Это директива, чтобы компонент стал клиентским

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'react-toastify';

export default function AddFurnVendorForm() {
    const [name, setName] = useState('');
    const [furnVendors, setFurnVendors] = useState([]); // Изначально массив
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const router = useRouter();

    useEffect(() => {
        const fetchFurnVendors = async () => {
            try {
                const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/furnVendors`);
                if (!response.ok) {
                    throw new Error('Failed to fetch furnVendors');
                }
                const data = await response.json();
                if (Array.isArray(data)) {
                    setFurnVendors(data); // Убедитесь, что это массив
                } else {
                    setFurnVendors([]); // Если это не массив, сбросьте до пустого
                }
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        fetchFurnVendors();
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();

        const furnVendorData = { name };

        try {
            const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/furnVendors`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(furnVendorData),
            });

            if (response.ok) {
                const result = await response.json();
                // console.log('FurnVendor added:', result);
                // toast('FurnVendor successfully added!');

                // Добавляем нового поставщика в существующий массив
                setFurnVendors((prevFurnVendors) => [...prevFurnVendors, result]);

                setName(''); // Очищаем ввод после добавления
            } else {
                const errorData = await response.json();
                console.error('Error adding FurnVendor:', errorData);
                toast(`Error: ${errorData.error}`);
            }
        } catch (error) {
            console.error('Network error:', error);
            toast('Network error. Please try again.');
        }
    };

    const handleFurnVendorClick = (id) => {
        router.push(`/furnVendor/${id}`); // Переход на страницу поля по id
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
                            {furnVendors.map((furnVendor) => (
                                <tr
                                    key={furnVendor.id}
                                    onClick={() => handleFurnVendorClick(furnVendor.id)}
                                    style={{ cursor: 'pointer' }}
                                >
                                    <td>{furnVendor.name}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
