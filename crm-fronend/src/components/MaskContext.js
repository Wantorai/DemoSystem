// /components/MaskContext.js
import { createContext, useContext, useState } from 'react';

const MaskContext = createContext();

export function MaskProvider({ children }) {
  const [isMasked, setIsMasked] = useState(false);
  const toggleMask = () => setIsMasked(v => !v);

  return (
    <MaskContext.Provider value={{ isMasked, toggleMask }}>
      {children}
    </MaskContext.Provider>
  );
}

// Хук для удобного использования в компонентах
export function useMask() {
  return useContext(MaskContext);
}
