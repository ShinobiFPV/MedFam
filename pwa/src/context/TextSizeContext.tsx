import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { TextSize } from '../types';

const TEXT_SIZE_KEY = 'medfam.textSize';
const DEFAULT_SIZE: TextSize = 'xl';

interface TextSizeContextValue {
  textSize: TextSize;
  setTextSize: (size: TextSize) => void;
}

const TextSizeContext = createContext<TextSizeContextValue | undefined>(undefined);

function readStoredSize(): TextSize {
  const raw = localStorage.getItem(TEXT_SIZE_KEY);
  return raw === 'large' || raw === 'xl' ? raw : DEFAULT_SIZE;
}

export function TextSizeProvider({ children }: { children: ReactNode }) {
  const [textSize, setTextSizeState] = useState<TextSize>(() => readStoredSize());

  useEffect(() => {
    document.documentElement.classList.remove('text-size-large', 'text-size-xl');
    document.documentElement.classList.add(`text-size-${textSize}`);
  }, [textSize]);

  const setTextSize = useCallback((size: TextSize) => {
    localStorage.setItem(TEXT_SIZE_KEY, size);
    setTextSizeState(size);
  }, []);

  const value = useMemo(() => ({ textSize, setTextSize }), [textSize, setTextSize]);

  return <TextSizeContext.Provider value={value}>{children}</TextSizeContext.Provider>;
}

export function useTextSize() {
  const ctx = useContext(TextSizeContext);
  if (!ctx) throw new Error('useTextSize must be used within a TextSizeProvider');
  return ctx;
}
