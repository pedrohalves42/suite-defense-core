import { useState, useCallback, useEffect } from 'react';

const STORAGE_KEY = 'cybershield-favorites';

export const useFavorites = () => {
  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(favorites));
  }, [favorites]);

  const toggleFavorite = useCallback((path: string) => {
    setFavorites(prev =>
      prev.includes(path)
        ? prev.filter(p => p !== path)
        : [...prev, path]
    );
  }, []);

  const isFavorite = useCallback((path: string) => favorites.includes(path), [favorites]);

  return { favorites, toggleFavorite, isFavorite };
};
