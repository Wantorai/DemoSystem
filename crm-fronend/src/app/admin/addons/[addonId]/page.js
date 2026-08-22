// src/app/admin/addons/[addonId]/page.js

"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import axios from "axios";

const ViewAddonPage = () => {
  const { addonId } = useParams();
  const [addon, setAddon] = useState(null);

  useEffect(() => {
    const fetchAddon = async () => {
      try {
        const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/addons/${addonId}`);
        setAddon(response.data);
      } catch (error) {
        console.error("Ошибка при загрузке надстройки:", error);
      }
    };

    fetchAddon();
  }, [addonId]);

  if (!addon) return <p>Загрузка...</p>;

  return (
    <div>
      <h1>{addon.name}</h1>
      <p>{addon.description}</p>
    </div>
  );
};

export default ViewAddonPage;
