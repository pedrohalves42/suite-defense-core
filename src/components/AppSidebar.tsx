import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { TooltipProvider } from '@/components/ui/tooltip';
import { SidebarTenantSelector } from '@/components/SidebarTenantSelector';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { useSuperAdmin } from '@/hooks/useSuperAdmin';
import { useCriticalInsights } from '@/hooks/useCriticalInsights';
import { useActionCenterCount } from '@/hooks/useActionCenter';
import { useFavorites } from '@/hooks/useFavorites';
import { useState, useEffect, useCallback, memo } from 'react';
import { bootVariants } from '@/components/sidebar/constants';
import { SidebarHeader } from '@/components/sidebar/SidebarHeader';
import { SidebarSearch } from '@/components/sidebar/SidebarSearch';
import { SidebarNavigation } from '@/components/sidebar/SidebarNavigation';
import { SidebarFooter } from '@/components/sidebar/SidebarFooter';

interface AppSidebarProps {
  mobile?: boolean;
  onNavigate?: () => void;
}

export const AppSidebar = memo(({ mobile = false, onNavigate }: AppSidebarProps) => {
  const { isAdmin } = useIsAdmin();
// ... keep existing code
  );
});

AppSidebar.displayName = 'AppSidebar';
