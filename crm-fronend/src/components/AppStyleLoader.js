"use client";

import { useEffect } from "react";

const DEFAULT_PRIMARY_OS_COLOR = "#007bff";
const CACHE_KEY = "app-style";
const WEBCHAT_FONT_SCALE_CACHE_KEY = "webchat-font-scale";

function normalizeWebChatFontScale(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 100;
  return Math.min(160, Math.max(80, Math.round(numeric)));
}

function getTokenUserId(token) {
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return String(payload?.id || "");
  } catch {
    return "";
  }
}

export function applyWebChatFontScale(value) {
  const percent = normalizeWebChatFontScale(value);
  const factor = percent / 100;
  document.documentElement.style.setProperty("--webchat-font-scale", String(factor));
  for (let base = 11; base <= 24; base += 1) {
    document.documentElement.style.setProperty(
      `--webchat-font-${base}`,
      `${(base * factor).toFixed(2)}px`
    );
  }
  document.documentElement.style.setProperty(
    "--webchat-font-input",
    `${Math.max(16, 16 * factor).toFixed(2)}px`
  );
}

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

    const token = localStorage.getItem("token") || "";
    const userId = getTokenUserId(token);
    const fontScaleMode = window.matchMedia("(max-width: 768px)").matches ? "mobile" : "desktop";
    const fontScaleCacheKey = userId
      ? `${WEBCHAT_FONT_SCALE_CACHE_KEY}:${userId}:${fontScaleMode}`
      : `${WEBCHAT_FONT_SCALE_CACHE_KEY}:${fontScaleMode}`;
    applyWebChatFontScale(localStorage.getItem(fontScaleCacheKey) || 100);

    const loadWebChatFontScale = async () => {
      try {
        if (!token) {
          applyWebChatFontScale(100);
          return;
        }
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/user-settings/webchat-text-scale?mode=${fontScaleMode}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) return;
        const settings = await response.json();
        const percent = normalizeWebChatFontScale(settings?.percent);
        applyWebChatFontScale(percent);
        localStorage.setItem(fontScaleCacheKey, String(percent));
      } catch {}
    };

    loadStyle();
    loadWebChatFontScale();
    const onStyleChanged = (event) => applyAppStyle(event.detail);
    const onWebChatFontScaleChanged = (event) => {
      const eventMode = event.detail?.mode || fontScaleMode;
      const percent = normalizeWebChatFontScale(event.detail?.percent ?? event.detail);
      applyWebChatFontScale(percent);
      try {
        const eventCacheKey = userId
          ? `${WEBCHAT_FONT_SCALE_CACHE_KEY}:${userId}:${eventMode}`
          : `${WEBCHAT_FONT_SCALE_CACHE_KEY}:${eventMode}`;
        localStorage.setItem(eventCacheKey, String(percent));
      } catch {}
    };
    window.addEventListener("app-style-changed", onStyleChanged);
    window.addEventListener("webchat-font-scale-changed", onWebChatFontScaleChanged);
    return () => {
      window.removeEventListener("app-style-changed", onStyleChanged);
      window.removeEventListener("webchat-font-scale-changed", onWebChatFontScaleChanged);
    };
  }, []);

  return null;
}
