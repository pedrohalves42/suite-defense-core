import { describe, it, expect } from 'vitest';
import { useFavorites } from '@/hooks/useFavorites';
import { renderHook, act } from '@testing-library/react';

describe('useFavorites', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('starts empty', () => {
    const { result } = renderHook(() => useFavorites());
    expect(result.current.favorites).toEqual([]);
  });

  it('toggleFavorite adds a path', () => {
    const { result } = renderHook(() => useFavorites());
    act(() => result.current.toggleFavorite('/admin/dashboard'));
    expect(result.current.favorites).toContain('/admin/dashboard');
    expect(result.current.isFavorite('/admin/dashboard')).toBe(true);
  });

  it('toggleFavorite removes existing path', () => {
    const { result } = renderHook(() => useFavorites());
    act(() => result.current.toggleFavorite('/admin/dashboard'));
    act(() => result.current.toggleFavorite('/admin/dashboard'));
    expect(result.current.favorites).not.toContain('/admin/dashboard');
  });

  it('persists to localStorage', () => {
    const { result } = renderHook(() => useFavorites());
    act(() => result.current.toggleFavorite('/test'));
    const stored = JSON.parse(localStorage.getItem('cybershield-favorites') || '[]');
    expect(stored).toContain('/test');
  });

  it('isFavorite returns false for non-favorite', () => {
    const { result } = renderHook(() => useFavorites());
    expect(result.current.isFavorite('/nonexistent')).toBe(false);
  });
});
