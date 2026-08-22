// app/config/Fields.js

'use client';  // Это директива, чтобы компонент стал клиентским

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'react-toastify';

export default function AddFieldForm() {
    const [name, setName] = useState('');
    const [fields, setFields] = useState([]); // Изначально массив
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const router = useRouter();

    useEffect(() => {
        const fetchFields = async () => {
            try {
                const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/fields`);
                if (!response.ok) {
                    throw new Error('Failed to fetch fields');
                }
                const data = await response.json();
                if (Array.isArray(data)) {
                    setFields(data); // Убедитесь, что это массив
                } else {
                    setFields([]); // Если это не массив, сбросьте до пустого
                }
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        fetchFields();
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();

        const fieldData = { name };

        try {
            const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/fields`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(fieldData),
            });

            if (response.ok) {
                const result = await response.json();
                // console.log('Field added:', result);
                //toast('Field successfully added!');

                // Добавляем новое поле в существующий массив
                setFields((prevFields) => [...prevFields, result]);

                setName(''); // Очищаем ввод после добавления
            } else {
                const errorData = await response.json();
                console.error('Error adding Field:', errorData);
                toast(`Error: ${errorData.error}`);
            }
        } catch (error) {
            console.error('Network error:', error);
            toast('Network error. Please try again.');
        }
    };

    const handleFieldClick = (id) => {
        router.push(`/field/${id}`); // Переход на страницу поля по id
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
                            {fields.map((field) => (
                                <tr
                                    key={field.id}
                                    onClick={() => handleFieldClick(field.id)}
                                    style={{ cursor: 'pointer' }}
                                >
                                    <td>{field.name}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
