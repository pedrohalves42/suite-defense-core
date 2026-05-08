import { Building2, ChevronDown, Check, Globe } from 'lucide-react';
import { useActiveTenant } from '@/hooks/useActiveTenant';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Skeleton } from '@/components/ui/skeleton';
import { motion, AnimatePresence } from 'framer-motion';

interface SidebarTenantSelectorProps {
  collapsed?: boolean;
}

export const SidebarTenantSelector = ({ collapsed = false }: SidebarTenantSelectorProps) => {
  const { tenants, activeTenant, setActiveTenant, hasMultipleTenants, loading } = useActiveTenant();

  if (loading) {
    return (
      <div className={cn("px-4 py-3", collapsed ? "flex justify-center" : "")}>
        <Skeleton className={cn("h-10", collapsed ? "w-10 rounded-xl" : "w-full rounded-2xl")} />
      </div>
    );
  }

  if (!activeTenant) {
    return null;
  }

  const SelectorButton = (
    <button className={cn(
      "flex items-center gap-3 w-full transition-all duration-500 rounded-2xl border",
      collapsed ? "h-10 justify-center px-0" : "h-12 px-4",
      "bg-white/[0.03] border-white/5 hover:bg-white/[0.06] hover:border-white/10 group relative overflow-hidden shadow-sm"
    )}>
      <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      
      <div className={cn(
        "p-1.5 rounded-lg transition-colors shrink-0",
        "bg-cta-positive/10 text-cta-positive group-hover:bg-cta-positive/20"
      )}>
        <Building2 className="h-4 w-4" />
      </div>
      
      {!collapsed && (
        <>
          <span className="text-xs font-bold truncate flex-1 text-left text-white/70 group-hover:text-white transition-colors tracking-tight">
            {activeTenant.name}
          </span>
          {hasMultipleTenants && (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-white/20 group-hover:text-white/40 transition-all duration-300 group-hover:translate-y-0.5" />
          )}
        </>
      )}
    </button>
  );

  // Single tenant - just the display
  if (!hasMultipleTenants) {
    if (collapsed) {
      return (
        <div className="px-3 py-3">
          <Tooltip>
            <TooltipTrigger asChild>
              {SelectorButton}
            </TooltipTrigger>
            <TooltipContent side="right" className="bg-black/90 border-white/10 text-[10px] font-bold uppercase tracking-widest px-3 py-2">
              {activeTenant.name}
            </TooltipContent>
          </Tooltip>
        </div>
      );
    }

    return (
      <div className="px-3 py-3">
        {SelectorButton}
      </div>
    );
  }

  // Multiple tenants - with dropdown logic
  return (
    <div className="px-3 py-3">
      <DropdownMenu>
        {collapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                {SelectorButton}
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent side="right" className="bg-black/90 border-white/10 text-[10px] font-bold uppercase tracking-widest px-3 py-2">
              {activeTenant.name}
            </TooltipContent>
          </Tooltip>
        ) : (
          <DropdownMenuTrigger asChild>
            {SelectorButton}
          </DropdownMenuTrigger>
        )}
        
        <DropdownMenuContent 
          side={collapsed ? "right" : "bottom"} 
          align={collapsed ? "start" : "center"} 
          className="w-64 glass-card border-white/10 p-2 rounded-2xl animate-in fade-in zoom-in-95 duration-200"
        >
          <div className="px-3 py-2 mb-1">
            <p className="text-[10px] font-black text-white/20 uppercase tracking-[0.2em]">Empresas Conectadas</p>
          </div>
          {tenants.map((tenant) => (
            <DropdownMenuItem
              key={tenant.id}
              onClick={() => setActiveTenant(tenant)}
              className={cn(
                "flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer transition-all duration-300 mb-0.5",
                tenant.id === activeTenant.id 
                  ? "bg-cta-positive/10 text-cta-positive border border-cta-positive/10" 
                  : "hover:bg-white/[0.05] text-white/50 hover:text-white"
              )}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className={cn(
                  "p-1.5 rounded-lg",
                  tenant.id === activeTenant.id ? "bg-cta-positive/20" : "bg-white/5"
                )}>
                  <Building2 className="h-3.5 w-3.5" />
                </div>
                <span className="text-sm font-semibold truncate tracking-tight">{tenant.name}</span>
              </div>
              {tenant.id === activeTenant.id && (
                <Check className="h-4 w-4 shrink-0" />
              )}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};

