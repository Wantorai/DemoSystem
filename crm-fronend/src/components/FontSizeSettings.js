"use client";

import React, { useEffect, useState } from "react";

const getDeviceId = () => {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return "";
  }
  return `${navigator.userAgent}-${window.innerWidth}`;
};

const FontSizeSettings = () => {
  const [fontSize, setFontSize] = useState(() => {
    const deviceId = getDeviceId();
    if (!deviceId) return "16";
    return localStorage.getItem(`fontSize-${deviceId}`) || "16";
  });

  useEffect(() => {
    document.documentElement.style.setProperty("--font-size", `${fontSize}px`);
  }, [fontSize]);

  useEffect(() => {
    const deviceId = getDeviceId();
    if (!deviceId) return;
    localStorage.setItem(`fontSize-${deviceId}`, fontSize);
  }, [fontSize]);

  const handleFontSizeChange = (event) => {
    setFontSize(event.target.value);
    document.documentElement.style.setProperty("--font-size", `${event.target.value}px`);
  };

  return (
    <div>
      {/* <h3>Веб-версия</h3> */}
      <label>
        Размер шрифта (px):
        <input
          type="number"
          value={fontSize}
          onChange={handleFontSizeChange}
          min="12"
          max="36"
        />
      </label>
    </div>
  );
};

export default FontSizeSettings;
