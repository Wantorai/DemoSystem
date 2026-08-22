'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import AddOrderConfigsForm from './AddOrderConfigs';
import axios from 'axios';

export default function OrderConfigsClient() {
  const [addons, setAddons] = useState([]);
  const [orderConfigs, setOrderConfigs] = useState([]); // Объекты конфигураций заказов
  const [orders, setOrders] = useState([]); // Заказы
  const [selectedAddon, setSelectedAddon] = useState(null);
  const [loading, setLoading] = useState(true);
  const [orderIdFilter, setOrderIdFilter] = useState('');

  const searchParams = useSearchParams();
  const orderIdFromQuery = searchParams.get('orderId');
  const addonId = searchParams.get('addonId');

  useEffect(() => {
    if (orderIdFromQuery) {
      setOrderIdFilter(orderIdFromQuery);
    }
  }, [orderIdFromQuery]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const addonsResponse = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/addons`);
        setAddons(addonsResponse.data);

        const orderConfigsResponse = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/orderConfigs`);
        setOrderConfigs(orderConfigsResponse.data);

        const ordersResponse = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/orders`);
        setOrders(ordersResponse.data);

      } catch (error) {
        console.error('Ошибка загрузки данных:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

   
  const realOrder = orders.find(item =>(item.data.order_number) === orderIdFromQuery);
  const orderNumber = realOrder ? realOrder.data.order_number : null;
  const realOrderId = realOrder ? realOrder.id : null;

  // console.log('realOrder', realOrder);

  const filteredOrderConfigs = realOrderId
    ? orderConfigs.filter(cfg => Number(cfg.order_id) === Number(realOrderId))
    : orderConfigs;

  const filteredAddons = addons.filter((addon) => {
    if (!realOrderId) return true;
    return filteredOrderConfigs.some(
      (config) => Number(config.addon_id) === Number(addon.id)
    );
  });

  useEffect(() => {
    if (filteredAddons.length > 0 && addonId) {
      const selected = filteredAddons.find((a) => a.id === Number(addonId));
      if (selected) {
        setSelectedAddon(selected);
      }
    }
  }, [filteredAddons, addonId]);

  if (loading) {
    return <p>Загрузка данных...</p>;
  }

  return (
    <div>
      <h1>Объекты конфигурации</h1>

      <div>
        <label className="labelClient" htmlFor="addon-select">Фильтр по надстройке:</label>
        <select
          className="newValueConfig"
          id="addon-select"
          value={selectedAddon?.id || ''}
          onChange={(e) => {
            const selectedId = e.target.value;
            setSelectedAddon(
              selectedId ? filteredAddons.find((a) => a.id === Number(selectedId)) : null
            );
          }}
        >
          <option value="">Все надстройки</option>
          {filteredAddons.map((addon) => (
            <option key={addon.id} value={addon.id}>
              {addon.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="labelClient" htmlFor="order-id">Фильтр по заказу:</label>
        <input
          className="newValueConfig"
          id="order-id"
          type="text"
          value={orderIdFilter || ''}
          onChange={(e) => {
            const newOrderId = e.target.value;
            setOrderIdFilter(newOrderId);
            const newUrl = new URL(window.location.href);
            if (newOrderId) {
              newUrl.searchParams.set('orderId', newOrderId);
            } else {
              newUrl.searchParams.delete('orderId');
            }
            window.history.pushState({}, '', newUrl);
          }}
          placeholder="Введите только цифры заказа..."
        />
      </div>

      <AddOrderConfigsForm 
        addonId={selectedAddon?.id} 
        addonName={selectedAddon?.name}
        orderId={realOrderId}
        allAddons={filteredAddons}
        orderNumber={orderNumber}
      />
    </div>
  );
}
