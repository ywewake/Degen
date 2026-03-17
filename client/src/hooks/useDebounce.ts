// CryptoAlpha — useDebounce Hook
// Section 5, Optimization 1: Debounce search input to reduce API calls.
// Section 2: Architecture fix — extracted from inline setTimeout in Home.tsx.

import { useState, useEffect } from 'react';

/**
 * Returns a debounced version of the value that only updates
 * after the specified delay has passed without any new changes.
 *
 * @param value - The value to debounce
 * @param delay - Delay in milliseconds (default: 300ms)
 */
export function useDebounce<T>(value: T, delay = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);

  return debouncedValue;
}
