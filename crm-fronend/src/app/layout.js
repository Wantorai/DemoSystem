﻿// app/layout.js
"use client";

import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import './globals.css';
import AuthProvider from "../context/AuthContext";
import Header from "../components/Header";
import { MaskProvider } from '../components/MaskContext';
import ProtectedLayout from "../components/ProtectedLayout";
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import MaintenanceNotifier from '../components/MaintenanceNotifier';
import AppStyleLoader from '../components/AppStyleLoader';
import InterfaceLocalizer from '../components/InterfaceLocalizer';


export default function RootLayout({ children }) {
  const pathname = usePathname();
  const [titles, setTitles] = useState({});
  const [isLoaded, setIsLoaded] = useState(false);
  const hideHeader =
    pathname === '/login' ||
    pathname === '/403' ||
    pathname === '/privacy-policy';


  // Функция для получения заголовков с сервера
  const fetchPageTitles = async () => {
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      if (!token) {
        setIsLoaded(true);
        return;
      }
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/permissions`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) {
        throw new Error("Не удалось загрузить данные");
      }
      const data = await response.json();
      const titleMap = {};
      
      // Генерация заголовков в нужном формате
      data.forEach(item => {
        // Формируем ключ в виде части пути (resource)
        const key = item.resource.replace(/\\/g, '/'); // Заменяем \ на /
        titleMap[key] = `${item.label} | OS-System`; // Формируем строку вида "label | OS-System"
      });
      
      setTitles(titleMap);
      setIsLoaded(true); // Устанавливаем флаг, что данные загружены
    } catch (error) {
      console.error("Ошибка при получении заголовков:", error);
    }
  };

  useEffect(() => {
    fetchPageTitles(); // Загружаем данные при монтировании компонента
  }, []);


  

  const getTitle = () => {
    if (!isLoaded) {
      return "OS-System"; // Заголовок по умолчанию, пока данные не загружены
    }
  
    // Убираем ведущие слэши
    const page = pathname.replace(/^\/+/, ''); 
  
    // Если точного совпадения в titles есть, возвращаем его
    if (titles[page]) {
      return titles[page];
    } 
    // Для динамических маршрутов
    else if (page.startsWith("order/")) {
      const parts = page.split("/");
      const id = parts[1] || "";
      return `Заказ № ${id} | OS-System`;
    } 
    else if (page.startsWith("client/")) {
      const parts = page.split("/");
      const id = parts[1] || "";
      return `Клиент № ${id} | OS-System`;
    }
    else if (page.startsWith("orderConfig/")) {
      const parts = page.split("/");
      const id = parts[1] || "";
      return `Объект надстройки № ${id} | OS-System`;
    }
    else if (page.startsWith("workVendor/")) {
      const parts = page.split("/");
      const id = parts[1] || "";
      return `Подрядчик № ${id} | OS-System`;
    }
    else if (page.startsWith("fasadVendor/")) {
      const parts = page.split("/");
      const id = parts[1] || "";
      return `Поставщик фасадов № ${id} | OS-System`;
    }
    else if (page.startsWith("furnVendor/")) {
      const parts = page.split("/");
      const id = parts[1] || "";
      return `Поставщик фурнитуры № ${id} | OS-System`;
    }
    else if (page.startsWith("technic/")) {
      const parts = page.split("/");
      const id = parts[1] || "";
      return `Технолог № ${id} | OS-System`;
    }
    else if (page.startsWith("installer/")) {
      const parts = page.split("/");
      const id = parts[1] || "";
      return `Установщик № ${id} | OS-System`;
    }
    
    // Если не подходит ни один вариант, возвращаем заголовок по умолчанию
    return "OS-System";
  };
  



  return (
    
    <html lang={process.env.NEXT_PUBLIC_LANGUAGE === "eng" ? "en" : "ru"}>
      <head>
        <meta charSet="UTF-8"/><title>{getTitle()}</title>
        {/* <meta charSet="UTF-8"/><title></title> */}
        <link rel="lcp" href="#main-search" />
      </head>
      <body>
        <InterfaceLocalizer />
        <AuthProvider>
          <AppStyleLoader />
          <MaskProvider>
          {!hideHeader && <Header />}
          <MaintenanceNotifier />
          <ProtectedLayout>
            {children}
          </ProtectedLayout>
          </MaskProvider>
        </AuthProvider>
        {/* Добавляем ToastContainer, чтобы уведомления появлялись во всех страницах */}
        <ToastContainer autoClose={3000} />
      </body>
    </html>
    
  );
}










// "use client";

// import './globals.css';
// import AuthProvider from "../context/AuthContext";
// import Header from '../components/Header'; // Подключаем хедер
// import ProtectedLayout from "../components/ProtectedLayout";



// export default function RootLayout({ children }) {
//     return (
//       <AuthProvider>
//       <html lang="en">
//         <head>
//           {/* метатеги или другие настройки */}
//           <meta charSet="UTF-8" />
//         </head>
//         <body>
//           <Header /> {/* Вставляем хедер */}
//           <ProtectedLayout>
//           {children}
//           </ProtectedLayout>
//         </body>
//       </html>
//       </AuthProvider>
//     );
// }
  

// npm run-script dev
