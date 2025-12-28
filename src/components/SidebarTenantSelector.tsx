import { Building2, ChevronDown, Check } from 'lucide-react';
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

interface SidebarTenantSelectorProps {
  collapsed?: boolean;
}

export const SidebarTenantSelector = ({ collapsed = false }: SidebarTenantSelectorProps) => {
  const { tenants, activeTenant, setActiveTenant, hasMultipleTenants, loading } = useActiveTenant();

  if (loading) {
    return (
      <div className={cn("px-2 py-2", collapsed ? "flex justify-center" : "")}>
        <Skeleton className={cn("h-9", collapsed ? "w-9" : "w-full")} />
      </div>
    );
  }

  if (!activeTenant) {
    return null;
  }

  // Se só tem um tenant, mostra apenas o nome (sem dropdown)
  if (!hasMultipleTenants) {
    if (collapsed) {
      return (
        <div className="px-2 py-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center justify-center h-9 w-full rounded-lg bg-accent/50 text-accent-foreground">
                <Building2 className="h-4 w-4" />
              </div>
            </TooltipTrigger>
            <TooltipContent side="right">
              {activeTenant.name}
            </TooltipContent>
          </Tooltip>
        </div>
      );
    }

    return (
      <div className="px-2 py-2">
        <div className="flex items-center gap-2 h-9 px-3 rounded-lg bg-accent/50 text-accent-foreground">
          <Building2 className="h-4 w-4 shrink-0" />
          <span className="text-sm font-medium truncate">{activeTenant.name}</span>
        </div>
      </div>
    );
  }

  // Múltiplos tenants - dropdown
  if (collapsed) {
    return (
      <div className="px-2 py-2">
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center justify-center h-9 w-full rounded-lg bg-accent/50 hover:bg-accent text-accent-foreground transition-colors">
                  <Building2 className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent side="right">
              {activeTenant.name}
            </TooltipContent>
          </Tooltip>
          <DropdownMenuContent side="right" align="start" className="w-56">
            {tenants.map((tenant) => (
              <DropdownMenuItem
                key={tenant.id}
                onClick={() => setActiveTenant(tenant)}
                className="flex items-center justify-between"
              >
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  <span className="truncate">{tenant.name}</span>
                </div>
                {tenant.id === activeTenant.id && (
                  <Check className="h-4 w-4 text-primary" />
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  }

  return (
    <div className="px-2 py-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-2 h-9 w-full px-3 rounded-lg bg-accent/50 hover:bg-accent text-accent-foreground transition-colors">
            <Building2 className="h-4 w-4 shrink-0" />
            <span className="text-sm font-medium truncate flex-1 text-left">{activeTenant.name}</span>
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          {tenants.map((tenant) => (
            <DropdownMenuItem
              key={tenant.id}
              onClick={() => setActiveTenant(tenant)}
              className="flex items-center justify-between"
            >
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                <span className="truncate">{tenant.name}</span>
              </div>
              {tenant.id === activeTenant.id && (
                <Check className="h-4 w-4 text-primary" />
              )}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};
