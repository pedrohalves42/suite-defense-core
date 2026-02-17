import { Building2, ChevronDown, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useActiveTenant } from '@/hooks/useActiveTenant';
import { Badge } from '@/components/ui/badge';

export const TenantSelector = () => {
  const { tenants, activeTenant, setActiveTenant, hasMultipleTenants, loading } = useActiveTenant();

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-card border border-border rounded-lg">
        <Building2 className="h-4 w-4 text-muted-foreground animate-pulse" />
        <span className="text-sm text-muted-foreground">Carregando...</span>
      </div>
    );
  }

  if (!activeTenant) {
    return null;
  }

  // If user only has one tenant, show it as a static badge
  if (!hasMultipleTenants) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-card border border-border rounded-lg">
        <Building2 className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium text-foreground truncate max-w-[200px]">
          {activeTenant.name}
        </span>
      </div>
    );
  }

  // Multiple tenants - show dropdown
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="outline" 
          className="flex items-center gap-2 bg-card border-border hover:bg-muted"
        >
          <Building2 className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium truncate max-w-[200px]">
            {activeTenant.name}
          </span>
          <Badge variant="secondary" className="text-xs ml-1">
            {tenants.length}
          </Badge>
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="bottom" className="w-64">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          Selecionar Tenant
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {tenants.map((tenant) => (
          <DropdownMenuItem
            key={tenant.id}
            onClick={() => setActiveTenant(tenant)}
            className="flex items-center justify-between cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <span className="truncate">{tenant.name}</span>
            </div>
            {tenant.id === activeTenant.id && (
              <Check className="h-4 w-4 text-primary" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
