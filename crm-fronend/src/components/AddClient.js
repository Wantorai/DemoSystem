// // components/AddClient.js
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Spinner from "./Spinner";
import { toast } from 'react-toastify';

export default function AddClientForm() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [representative, setRepresentative] = useState('');
  const [representativePhone, setRepresentativePhone] = useState('');
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Проверка заполненности обязательных полей
    if (!name.trim() || !phone.trim()) {
      toast('Пожалуйста, заполните обязательные поля (Имя и Телефон).');
      return;
    }

    // Проверка на дубликат
    try {
      const duplicateResponse = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/clients?search=${encodeURIComponent(name)}`
      );
      setLoading(true);
      if (duplicateResponse.ok) {
        const existingClients = await duplicateResponse.json();
        const duplicate = existingClients.find(
          (client) => client.name.toLowerCase() === name.trim().toLowerCase()
        );
        if (duplicate) {
          toast('Клиент с таким именем уже существует!');
          return;
        }
      } else {
        console.error('Ошибка проверки на дубликат');
      }
    } catch (err) {
      console.error('Ошибка проверки на дубликат:', err);
      // Если ошибка при проверке — можно не блокировать сохранение,
      // но обычно лучше сообщить пользователю и прекратить дальнейшее выполнение
      toast('Ошибка проверки существующих клиентов. Попробуйте позже.');
      return;
    }

    const clientData = { name, email, phone, representative, representativePhone };

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/clients`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(clientData),
      });

      if (response.ok) {
        // const result = await response.json();
        // console.log('Client added:', result);
        router.push('/clients');
      } else {
        const errorData = await response.json();
        console.error('Ошибка при добавлении клиента:', errorData);
        toast(`Ошибка: ${errorData.error}`);
      }
    } catch (error) {
      console.error('Ошибка сети:', error);
      toast('Ошибка сети. Пожалуйста, попробуйте еще раз.');
    }
  };

  if (loading) {
    return <Spinner />;
  }

  return (
    <form onSubmit={handleSubmit} className="add-client-page px-3 pb-6 pt-3 sm:px-4">
      <div className="details add-client-fields mx-auto max-w-2xl rounded-lg border border-gray-200 bg-white p-4 shadow-lg sm:p-6">
        <div className="detail-row">
          <label className="labelClient">Имя: </label>
          <input
            className="valueClient border p-2 rounded"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div className="detail-row">
          <label className="labelClient">Email: </label>
          <input
            className="valueClient border p-2 rounded"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="detail-row">
          <label className="labelClient">Телефон: </label>
          <input
            className="valueClient border p-2 rounded"
            type="text"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
          />
        </div>
        <div className="detail-row">
          <label className="labelClient">Представитель: </label>
          <input
            className="valueClient border p-2 rounded"
            type="text"
            value={representative}
            onChange={(e) => setRepresentative(e.target.value)}
          />
        </div>
        <div className="detail-row">
          <label className="labelClient">Телефон представителя: </label>
          <input
            className="valueClient border p-2 rounded"
            type="text"
            value={representativePhone}
            onChange={(e) => setRepresentativePhone(e.target.value)}
          />
        </div>
      </div>
      <div className="add-client-actions mx-auto mt-4 flex max-w-2xl flex-col gap-3 sm:flex-row">
        <button type="submit" className="os-primary-bg text-white px-4 py-2 rounded">
          Сохранить
        </button>
        <button type="button" onClick={() => router.back()} className="bg-gray-500 text-white px-4 py-2 rounded">
          Отмена
        </button>
      </div>
    </form>
  );
}


// 'use client';  // Это директива, чтобы компонент стал клиентским

// import { useState } from 'react';
// import { useRouter } from 'next/navigation';

// export default function AddClientForm() {
//     const [name, setName] = useState('');
//     const [email, setEmail] = useState('');
//     const [phone, setPhone] = useState('');
//     const [representative, setRepresentative] = useState('');
//     const [representativePhone, setRepresentativePhone] = useState('');
//     const router = useRouter();

//     const handleSubmit = async (e) => {
//         e.preventDefault();
    
//         if (!name.trim() || !phone.trim()) {
//             toast('Пожалуйста, заполните все обязательные поля!');
//             return;
//         }
    
//         const clientData = { name, email, phone, representative, representativePhone };
    
//         try {
//             const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/clients`, {
//                 method: 'POST',
//                 headers: {
//                     'Content-Type': 'application/json',
//                 },
//                 body: JSON.stringify(clientData),
//             });
    
//             if (response.ok) {
//                 const result = await response.json();
//                 // console.log('Client added:', result);
//                 toast('Клиент успешно добавлен');
//                 router.push('/clients'); // Перенаправление только после успешного добавления
//             } else {
//                 const errorData = await response.json();
//                 console.error('Error adding client:', errorData);
//                 toast(`Error: ${errorData.error}`);
//             }
//         } catch (error) {
//             console.error('Network error:', error);
//             toast('Network error. Please try again.');
//         }
//     };
    
    

//     return (
//         <form onSubmit={handleSubmit}>
//           <div className="details">  
//             <div className="detail-row">
//                 <label className="labelClient">Имя: </label>
//                 <input className="valueClient"
//                     type="text"
//                     placeholder=""
//                     value={name}
//                     onChange={(e) => setName(e.target.value)}
//                     required
//                 />
//                 <p></p>
//             </div>
//             <div className="detail-row">
//                 <label className="labelClient">Email: </label>
//                 <input className="valueClient"
//                     type="email"
//                     placeholder=""
//                     value={email}
//                     onChange={(e) => setEmail(e.target.value)}
                    
//                 />
//                 <p></p>
//             </div>
//             <div className="detail-row">
//                 <label className="labelClient">Телефон: </label>
//                 <input className="valueClient"
//                     type="text"
//                     placeholder=""
//                     value={phone}
//                     onChange={(e) => setPhone(e.target.value)}
//                     required
//                 />
//                 <p></p>
//             </div>
//             <div className="detail-row">
//                 <label className="labelClient">Представитель: </label>
//                 <input  className="valueClient" type="text" value={representative} onChange={(e) => setRepresentative(e.target.value)} />
//                 <p></p>
//             </div>

//             <div className="detail-row">
//                 <label className="labelClient">Телефон представителя: </label>
//                 <input  className="valueClient" type="text" value={representativePhone} onChange={(e) => setRepresentativePhone(e.target.value)} />
//                 <p></p>
//             </div>
//             </div>
//             <button type="submit">Сохранить</button>
//             <button  type="button" onClick={() => router.back()}>Отмена</button>
//         </form>
//     );
// }
