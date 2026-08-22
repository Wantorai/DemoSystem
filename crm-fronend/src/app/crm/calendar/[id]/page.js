'use client'

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import FullCalendar from '@fullcalendar/react';
import listPlugin from '@fullcalendar/list';
import ruLocale from '@fullcalendar/core/locales/ru';
import axios from 'axios';
import dayjs from 'dayjs';
import { useRouter } from 'next/navigation';

export default function CalendarTechnologistPage() {
  const { id } = useParams(); // получаем userId из URL
  const [events, setEvents] = useState([]);
  const router = useRouter();

  // console.log('Текущий ID технолога:', id);

  useEffect(() => {
    const fetchData = async () => {
      const [recordsRes, technicsRes, holidaysRes] = await Promise.all([
        axios.get(`${process.env.NEXT_PUBLIC_API_URL}/crm?technologistId=${id}`),
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
  }, [id]);




  // useEffect(() => {
  //   if (!id) return;

  //   const fetchData = async () => {
  //     try {
  //       const res = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/crm?technologistId=${id}`);
  //       // console.log('Отфильтрованные заявки:', res.data);

  //       const technicsRes = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/technics`);
  //       const technicsData = technicsRes.data;

  //       // вычисляем цвет напрямую из свежего массива technicsData
  //       const found = technicsData.find(item => Number(item.id) === Number(id));
  //       const technicColor = found?.color ?? null;
  //       // console.log('Цвет техники:', technicColor);

  //       const recordEvents = res.data.map(rec => {
  //       const date = dayjs(rec.serviceDate).format('YYYY-MM-DD');
  //       const servTime = dayjs(`${date}T${rec.serviceTime}`).toISOString();        

  //       const consultTime = rec.serviceDate || servTime

  //         return {
  //           id: 'rec_' + rec.id,
  //           title: `${rec.address}`,
  //           start: consultTime,
  //           allDay: false,
  //           color: technicColor,
  //         };
  //       });

  //       setEvents(recordEvents);
  //     } catch (err) {
  //       console.error('Ошибка загрузки заявок:', err);
  //     }
  //   };

  //   fetchData();
  // }, [id]);


const handleEventClick = (info) => {
  const eventId = info.event.id;

  // Пропускаем клики по праздникам, если они есть
  if (!eventId.startsWith('rec_')) return;

  const recordId = eventId.replace('rec_', '');

  router.push(`/consult/${recordId}`);
  };

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold mb-4">Мой календарь</h1>
      <FullCalendar
        plugins={[listPlugin]}
        initialView="listMonth"
        locale={ruLocale}
        events={events}
        eventClick={handleEventClick}
        height="auto"
        headerToolbar={{
            left: '',            // убираем все кнопки слева
            center: 'title',     // показываем только заголовок (месяц и год)
            right: 'prev,next'   // кнопки вперед/назад справа
        }}
      />
    </div>
  );
}
