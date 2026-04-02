import { describe, it, expect, vi, beforeEach } from 'vitest';
import { exportToCSV } from '../csv-export';

describe('csv-export', () => {
  let appendChildSpy: ReturnType<typeof vi.spyOn>;
  let removeChildSpy: ReturnType<typeof vi.spyOn>;
  let clickSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    clickSpy = vi.fn();
    appendChildSpy = vi.spyOn(document.body, 'appendChild').mockImplementation((node) => {
      if (node instanceof HTMLAnchorElement) {
        node.click = clickSpy;
      }
      return node;
    });
    removeChildSpy = vi.spyOn(document.body, 'removeChild').mockReturnValue(document.createElement('a'));
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
  });

  it('throws for empty data', () => {
    expect(() => exportToCSV([], 'test', [{ key: 'a', label: 'A' }])).toThrow('Nenhum dado');
  });

  it('creates CSV and triggers download', () => {
    const data = [{ name: 'Alice', age: 30 }];
    const columns = [{ key: 'name' as const, label: 'Nome' }, { key: 'age' as const, label: 'Idade' }];
    
    exportToCSV(data, 'export', columns);
    
    expect(appendChildSpy).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();
    expect(removeChildSpy).toHaveBeenCalled();
  });

  it('escapes values with commas', () => {
    const data = [{ val: 'hello, world' }];
    exportToCSV(data, 'test', [{ key: 'val' as const, label: 'Value' }]);
    expect(appendChildSpy).toHaveBeenCalled();
  });

  it('handles null values', () => {
    const data = [{ val: null }];
    exportToCSV(data, 'test', [{ key: 'val' as const, label: 'Value' }]);
    expect(appendChildSpy).toHaveBeenCalled();
  });
});
