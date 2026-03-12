import { useRef, useCallback } from "react";
// @ts-ignore - react-window types mismatch
import { FixedSizeList as List } from "react-window";

interface VirtualizedListProps<T> {
  items: T[];
  itemHeight: number;
  maxHeight: number;
  renderItem: (item: T, index: number) => React.ReactNode;
  /** Threshold below which normal rendering is used */
  virtualizationThreshold?: number;
}

/**
 * Virtualizes lists with 50+ items using react-window.
 * Falls back to normal rendering for smaller lists.
 */
export function VirtualizedList<T>({
  items,
  itemHeight,
  maxHeight,
  renderItem,
  virtualizationThreshold = 50,
}: VirtualizedListProps<T>) {
  const listRef = useRef<List>(null);

  const Row = useCallback(
    ({ index, style }: { index: number; style: React.CSSProperties }) => (
      <div style={style}>{renderItem(items[index], index)}</div>
    ),
    [items, renderItem]
  );

  if (items.length < virtualizationThreshold) {
    return (
      <div className="space-y-2">
        {items.map((item, index) => (
          <div key={index}>{renderItem(item, index)}</div>
        ))}
      </div>
    );
  }

  const height = Math.min(items.length * itemHeight, maxHeight);

  return (
    <List
      ref={listRef}
      height={height}
      itemCount={items.length}
      itemSize={itemHeight}
      width="100%"
      className="scrollbar-thin"
    >
      {Row}
    </List>
  );
}
