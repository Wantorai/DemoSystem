"use client";

import { useEffect } from "react";

const DEFAULT_PRIMARY_OS_COLOR = "#007bff";
const CACHE_KEY = "app-style";

function isHexColor(value) {
  return /^#[0-9a-f]{6}$/i.test(String(value || "").trim());
}

export function applyAppStyle(style = {}) {
  const primaryOsColor = isHexColor(style.primaryOsColor)
    ? String(style.primaryOsColor).toLowerCase()
    : DEFAULT_PRIMARY_OS_COLOR;

  document.documentElement.style.setProperty("--primary-os-color", primaryOsColor);
  document.documentElement.style.setProperty(
    "--primary-os-hover-color",
    `color-mix(in srgb, ${primaryOsColor} 82%, black)`
  );
}

export default function AppStyleLoader() {
  useEffect(() => {
    try {
      const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
      if (cached) applyAppStyle(cached);
    } catch {}

    const loadStyle = async () => {
      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/app-style`);
        if (!response.ok) return;
        const style = await response.json();
        applyAppStyle(style);
        localStorage.setItem(CACHE_KEY, JSON.stringify(style));
      } catch {}
    };

    loadStyle();
    const onStyleChanged = (event) => applyAppStyle(event.detail);
    window.addEventListener("app-style-changed", onStyleChanged);
    return () => window.removeEventListener("app-style-changed", onStyleChanged);
  }, []);

  return null;
}
