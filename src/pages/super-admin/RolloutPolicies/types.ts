export interface RolloutPolicy {
  id: string;
  platform: string;
  target_version: string;
  rollout_percentage: number;
  enabled: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export const PLATFORMS = [
  { id: 'windows', label: 'Windows', icon: 'Monitor' as const },
  { id: 'linux', label: 'Linux', icon: 'Terminal' as const },
  { id: 'macos', label: 'macOS', icon: 'Apple' as const },
] as const;
