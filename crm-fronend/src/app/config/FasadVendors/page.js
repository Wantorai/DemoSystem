// app/config/FasadVendors.js

'use client';  // Это директива, чтобы компонент стал клиентским

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'react-toastify';

export default function AddFasadVendorForm() {
    const [name, setName] = useState('');
    const [fasadVendors, setFasadVendors] = useState([]); // Изначально массив
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const router = useRouter();

    useEffect(() => {
        const fetchFasadVendors = async () => {
            try {
                const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/fasadVendors`);
                if (!response.ok) {
                    throw new Error('Failed to fetch fasadVendors');
                }
                const data = await response.json();
                if (Array.isArray(data)) {
                    setFasadVendors(data); // Убедитесь, что это массив
                } else {
                    setFasadVendors([]); // Если это не массив, сбросьте до пустого
                }
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        fetchFasadVendors();
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();

        const fasadVendorData = { name };

        try {
            const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/fasadVendors`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(fasadVendorData),
            });

            if (response.ok) {
                const result = await response.json();
                // console.log('FasadVendor added:', result);
                // toast('FasadVendor successfully added!');

                // Добавляем нового поставщика в существующий массив
                setFasadVendors((prevFasadVendors) => [...prevFasadVendors, result]);

                setName(''); // Очищаем ввод после добавления
            } else {
                const errorData = await response.json();
                console.error('Error adding FasadVendor:', errorData);
                toast(`Error: ${errorData.error}`);
            }
        } catch (error) {
            console.error('Network error:', error);
            toast('Network error. Please try again.');
        }
    };

    const handleFasadVendorClick = (id) => {
        router.push(`/fasadVendor/${id}`); // Переход на страницу поля по id
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
                            {fasadVendors.map((fasadVendor) => (
                                <tr
                                    key={fasadVendor.id}
                                    onClick={() => handleFasadVendorClick(fasadVendor.id)}
                                    style={{ cursor: 'pointer' }}
                                >
                                    <td>{fasadVendor.name}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
