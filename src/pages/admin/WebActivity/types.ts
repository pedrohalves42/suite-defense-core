export type SortField = 'domain' | 'category' | 'hits' | 'last_seen_at';
export type SortDir = 'asc' | 'desc';

export const ITEMS_PER_PAGE = 30;

export interface EnrichedActivity {
  domain: string;
  hits: number;
  first_seen_at: string;
  last_seen_at: string;
  category: {
    key: string;
    name: string;
    icon: string;
    color: string;
  };
  isBlocked: boolean;
}
