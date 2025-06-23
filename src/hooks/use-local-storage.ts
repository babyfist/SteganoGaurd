
"use client"
import { useState, useEffect } from 'react';

/**
 * A custom React hook that syncs a state value with `window.localStorage`.
 * It's designed to work seamlessly with server-side rendering (SSR) frameworks like Next.js
 * by ensuring that `localStorage` is only accessed on the client side.
 *
 * @template T The type of the value to be stored.
 * @param {string} key The key under which the value is stored in `localStorage`.
 * @param {T} initialValue The initial value to use if no value is found in `localStorage` or on the server.
 * @returns {[T, (value: T | ((val: T) => T)) => void]} A tuple containing the current state value and a function to update it.
 */
export function useLocalStorage<T>(key: string, initialValue: T): [T, (value: T | ((val: T) => T)) => void] {
  // Use a state to hold the current value. The initializer function for useState
  // is only executed on the initial render.
  const [storedValue, setStoredValue] = useState<T>(() => {
    // Server-side rendering check.
    if (typeof window === 'undefined') {
      return initialValue;
    }
    try {
      // Try to get the value from localStorage on the client.
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      // If parsing fails, log the error and return the initial value.
      console.error(`Error reading localStorage key “${key}”:`, error);
      return initialValue;
    }
  });

  // Use an effect to update localStorage whenever the state value changes.
  useEffect(() => {
    try {
      // Only run on the client.
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(key, JSON.stringify(storedValue));
      }
    } catch (error) {
      console.error(`Error setting localStorage key “${key}”:`, error);
    }
  }, [key, storedValue]);

  return [storedValue, setStoredValue];
}
