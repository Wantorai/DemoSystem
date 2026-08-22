'use client'

import { useEffect, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import ruLocale from '@fullcalendar/core/locales/ru';
import axios from 'axios';
import dayjs from 'dayjs';
import listPlugin from '@fullcalendar/list';
import { useRouter } from 'next/navigation';

export default function CalendarPage() {
  const [events, setEvents] = useState([]);
  const router = useRouter();

  // useEffect(() => {
  //   const fetchData = async () => {
  //     const [recordsRes] = await Promise.all([
  //       axios.get(`${process.env.NEXT_PUBLIC_API_URL}/crm`),
  //     ]);

  //     const [technicsRes] = await Promise.all([
  //       axios.get(`${process.env.NEXT_PUBLIC_API_URL}/technics`),
  //     ]);
  //     const technicsData = technicsRes.data

  //     // console.log('technicsRes =', technicsRes.data)
  //     // console.log('Fetched records:', recordsRes.data);
      
  //       const recordEvents = recordsRes.data.map(rec => {
  //       const date = dayjs(rec.serviceDate).format('YYYY-MM-DD');

  //       const servTime = dayjs(`${date}T${rec.serviceTime}`).toISOString();

  //       const consultTime = rec.serviceDate || servTime

  //       const technicColor = findTechnicColor(rec.technicName);

  //       function findTechnicColor(technicName) {
  //         const found = technicsData.find(item => item.name === technicName);
  //         const color = found?.color ?? null;
  //         return color
  //       }

  //       return {
  //           id: 'rec_' + rec.id,
  //           title: `${rec.address}\n | Технолог: ${rec.technicName}`,
  //           start: consultTime,
  //           allDay: false,
  //           color: technicColor,
  //       };
  //       });

  //     setEvents([...recordEvents]);
  //   };

  //   fetchData();
  // }, []);


  useEffect(() => {
    const fetchData = async () => {
      const [recordsRes, technicsRes, holidaysRes] = await Promise.all([
        axios.get(`${process.env.NEXT_PUBLIC_API_URL}/crm`),
        axios.get(`${process.env.NEXT_PUBLIC_API_URL}/technics`),
        axios.get(`${process.env.NEXT_PUBLIC_API_URL}/holidays`) // твоя таблица выходных
      ]);

      const technicsData = technicsRes.data;
      const holidays = holidaysRes.data.map(h => h.date); // ['2025-01-05', ...]

      const recordEvents = recordsRes.data.map(rec => {
        const date = dayjs(rec.serviceDate).format('YYYY-MM-DD');
        const servTime = dayjs(`${date}T${rec.serviceTime}`).toISOString();
        const consultTime = rec.serviceDate || servTime;

        const found = technicsData.find(item => item.name === rec.technicName);
        const technicColor = found?.color ?? null;

        return {
          id: 'rec_' + rec.id,
          title: `${rec.address}\n | Технолог: ${rec.technicName}`,
          start: consultTime,
          allDay: false,
          color: technicColor,
        };
      });

      const holidaysWithoutConsults = holidays.filter(dateStr => {
        return !recordsRes.data.some(rec =>
          dayjs(rec.serviceDate).format('YYYY-MM-DD') === dateStr
        );
      });


      // Добавляем "пустые" события для выходных
      const holidayEvents = holidaysWithoutConsults.map(dateStr => ({
        id: 'holiday_' + dateStr,
        // title: 'Выходной день',
        start: dateStr,
        allDay: true,
        color: '#000', // серый фон
        textColor: '#888', // серый текст
        display: 'list-item', // обычный элемент списка
        classNames: ['holiday-row'] // свой класс
      }));

      setEvents([...recordEvents, ...holidayEvents]);
    };

    fetchData();
  }, []);



  const handleEventClick = (info) => {
  const eventId = info.event.id;

  // Пропускаем клики по праздникам, если они есть
  if (!eventId.startsWith('rec_')) return;

  const recordId = eventId.replace('rec_', '');

  router.push(`/consult/${recordId}`);
  };



  return (
    <div className="p-4">
    <h1 className="text-xl font-bold mb-4">Календарь всех технологов</h1>
      <FullCalendar
        plugins={[listPlugin]}
        initialView="listMonth"
        locale={ruLocale}
        events={events}
        height="auto"
        eventDisplay="block"
        eventClick={handleEventClick}
        dayMaxEventRows={2}
        eventTimeFormat={{
          hour: '2-digit',
          minute: '2-digit',
          hour12: false
        }}
        headerToolbar={{
            left: '',            // убираем все кнопки слева
            center: 'title',     // показываем только заголовок (месяц и год)
            right: 'prev,next'   // кнопки вперед/назад справа
        }}
      />
    </div>
  );
}
