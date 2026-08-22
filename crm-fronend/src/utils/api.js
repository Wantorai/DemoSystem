// src/utils/api.js

"use client";

const API_BASE_URL = `${process.env.NEXT_PUBLIC_API_URL}`; // Базовый URL для API



// Функция для выполнения запросов
const apiRequest = async (endpoint, method = "GET", body = null) => {
  const headers = { "Content-Type": "application/json" };

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : null,
    });

    if (!response.ok) {
      throw new Error(`Ошибка ${response.status}: ${response.statusText}`);
    }

    return response.json();
  } catch (error) {
    console.error(`Ошибка при выполнении запроса: ${error.message}`);
    throw error;
  }
};

// Получить список надстроек
export const getAddons = async () => {
  return await apiRequest("/addons");
};

// Создать новую надстройку
export const createAddon = async (addon) => {
  return await apiRequest("/addons", "POST", addon);
};

// Получить надстройку по ID
export const getAddonById = async (id) => {
  return await apiRequest(`/addons/${id}`);
};

// Обновить надстройку
export const updateAddon = async (id, addon) => {
  return await apiRequest(`/addons/${id}`, "PUT", addon);
};

// Удалить надстройку
export const deleteAddon = async (id) => {
  return await apiRequest(`/addons/${id}`, "DELETE");
};

