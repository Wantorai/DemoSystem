'use client';

import { useEffect } from "react";

function useDragScroll(ref) {
  useEffect(() => {
    const container = ref.current;
    if (!container) return;

    const handleContextMenu = (e) => {
      e.preventDefault();
    };

    const handleMouseDown = (e) => {
      if (e.button === 2) {
        e.preventDefault();
      }
    };

    // Добавляем обработчики непосредственно на контейнер
    container.addEventListener('contextmenu', handleContextMenu);
    container.addEventListener('mousedown', handleMouseDown);

    return () => {
      container.removeEventListener('contextmenu', handleContextMenu);
      container.removeEventListener('mousedown', handleMouseDown);
    };
  }, [ref]); // Добавляем ref в зависимости
}

export default useDragScroll;