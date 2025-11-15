import { Shield, User, Eye, Trash2, Crown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SafeSelect } from '@/components/SafeSelect';
import { AppRole, isValidRole } from '@/types/roles';
import { Member } from '@/types/user';

interface MemberCardProps {
  member: Member;
  onRoleChange: (userId: string, newRole: AppRole) => void;
  onRemove: (member: Member) => void;
  isUpdating: boolean;
}

/**
 * CORREÇÃO: Componente extraído para melhor organização
 * Renderiza um card de membro com controles de role e remoção
 */
export const MemberCard = ({ member, onRoleChange, onRemove, isUpdating }: MemberCardProps) => {
  const getRoleBadge = (role: AppRole) => {
    const configs = {
      viewer: { icon: Eye, variant: 'outline' as const, label: 'Visualizador' },
      operator: { icon: User, variant: 'secondary' as const, label: 'Operador' },
      admin: { icon: Shield, variant: 'default' as const, label: 'Admin' },
      super_admin: { icon: Crown, variant: 'destructive' as const, label: 'Super Admin' }
    };
    
    const config = configs[role] || configs.viewer;
    const Icon = config.icon;
    
    return (
      <Badge variant={config.variant} className="gap-1">
        <Icon className="h-3 w-3" />
        {config.label}
      </Badge>
    );
  };

  // CORREÇÃO: Usar isValidRole e não rebaixar super_admin
  const validRole = isValidRole(member.role) ? member.role : 'viewer';

  return (
    <div key={member.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/50 transition-colors">
      <div className="flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <p className="font-medium">{member.profiles?.full_name || 'Nome não disponível'}</p>
          {getRoleBadge(validRole)}
        </div>
        <p className="text-sm text-muted-foreground">{member.email || 'Email não disponível'}</p>
        <p className="text-xs text-muted-foreground">
          Entrou em: {new Date(member.created_at).toLocaleDateString('pt-BR')}
        </p>
      </div>
      
      <div className="flex items-center gap-3">
        <SafeSelect
          value={validRole}
          onValueChange={(newRole) => onRoleChange(member.user_id, newRole as AppRole)}
          options={[
            { value: 'viewer', label: 'Visualizador' },
            { value: 'operator', label: 'Operador' },
            { value: 'admin', label: 'Admin' },
            { value: 'super_admin', label: 'Super Admin' },
          ]}
          className="w-32"
          disabled={isUpdating}
        />
        
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onRemove(member)}
          className="text-destructive hover:text-destructive hover:bg-destructive/10"
          disabled={isUpdating}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};
