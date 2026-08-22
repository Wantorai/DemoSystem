// src/components/AddOrderConfigClient.js


'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import AddOrderConfigForm from './AddOrderConfig';
import axios from 'axios';

export default function AddOrderConfigClient() {
  const searchParams = useSearchParams();
  const initialAddonId = searchParams.get('addonId');

  const [addons, setAddons] = useState([]);
  const [selectedAddon, setSelectedAddon] = useState(initialAddonId || null);
  const [loading, setLoading] = useState(!initialAddonId);
  const [addonName, setAddonName] = useState('');

  useEffect(() => {
    if (!initialAddonId) {
      const fetchAddons = async () => {
        try {
          const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/addons`);
          setAddons(response.data);
        } catch (error) {
          console.error('Ошибка загрузки списка надстроек:', error);
        } finally {
          setLoading(false);
        }
      };
      fetchAddons();
    }
  }, [initialAddonId]);

  useEffect(() => {
    if (initialAddonId) {
      const fetchAddonName = async () => {
        try {
          const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/addons/${initialAddonId}`);
          setAddonName(response.data.name);
        } catch (error) {
          console.error('Ошибка загрузки имени надстройки:', error);
          setAddonName('Неизвестно');
        }
      };
      fetchAddonName();
    }
  }, [initialAddonId]);

  if (!initialAddonId && loading) {
    return <p>Загрузка списка надстроек...</p>;
  }

  return (
    <div>
      {!initialAddonId && (
        <div>
          <label className="labelClient" htmlFor="addon-select">Выберите надстройку:</label>
          <select
            className="newValueConfig"
            id="addon-select"
            value={selectedAddon || ''}
            onChange={(e) => setSelectedAddon(e.target.value)}
          >
            <option value="" disabled>-- Выберите --</option>
            {addons.map((addon) => (
              <option key={addon.id} value={addon.id}>{addon.name}</option>
            ))}
          </select>
        </div>
      )}

      {selectedAddon && <AddOrderConfigForm addonId={selectedAddon} addonName={addonName} />}
    </div>
  );
}
