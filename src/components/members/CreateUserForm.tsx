import { useState } from 'react';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Eye, EyeOff, User, Lock, UserPlus, Loader2, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import { AppRole } from '@/types/roles';

const createUserSchema = z.object({
  username: z.string()
    .min(3, 'Username deve ter pelo menos 3 caracteres')
    .max(32, 'Username deve ter no máximo 32 caracteres')
    .regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/, 'Username deve começar com letra e conter apenas letras, números, _ ou -'),
  password: z.string()
    .min(8, 'Senha deve ter pelo menos 8 caracteres')
    .max(72, 'Senha deve ter no máximo 72 caracteres')
    .regex(/[A-Z]/, 'Senha deve conter letra maiúscula')
    .regex(/[a-z]/, 'Senha deve conter letra minúscula')
    .regex(/[0-9]/, 'Senha deve conter número'),
  full_name: z.string()
    .min(2, 'Nome deve ter pelo menos 2 caracteres')
    .max(100, 'Nome deve ter no máximo 100 caracteres'),
  role: z.enum(['admin', 'operator', 'viewer']),
});

type CreateUserFormData = z.infer<typeof createUserSchema>;

interface CreateUserFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateUserForm({ open, onOpenChange }: CreateUserFormProps) {
  const { tenant } = useTenant();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<AppRole>('operator');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const passwordChecks = {
    length: password.length >= 8,
    upper: /[A-Z]/.test(password),
    lower: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
  };

  const passwordStrength = Object.values(passwordChecks).filter(Boolean).length;

  const createUser = useMutation({
    mutationFn: async (data: CreateUserFormData) => {
      if (!tenant?.id) {
        throw new Error('Nenhum tenant selecionado');
      }
      
      const { data: { session } } = await supabase.auth.getSession();
      
      const { data: result, error } = await supabase.functions.invoke('admin-create-user', {
        body: { 
          ...data,
          tenant_id: tenant.id,  // Enviar tenant atual explicitamente
        },
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
        },
      });

      if (error) {
        // Extract actual error message from edge function response
        let msg = error.message;
        try {
          if ('context' in error && typeof (error as Record<string, unknown>).context?.json === 'function') {
            const body = await (error as Record<string, unknown>).context.json();
            msg = body?.error || body?.error?.message || msg;
          }
        } catch {}
        throw new Error(msg);
      }
      if (!result?.success) throw new Error(result?.error || 'Erro ao criar usuário');
      return result;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['tenant-members', tenant?.id] });
      toast({
        title: 'Usuário criado com sucesso',
        description: `${data.user.username} foi criado. Ele deve trocar a senha no primeiro login.`,
      });
      resetForm();
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao criar usuário',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const resetForm = () => {
    setUsername('');
    setPassword('');
    setFullName('');
    setRole('operator');
    setErrors({});
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const validation = createUserSchema.safeParse({
      username,
      password,
      full_name: fullName,
      role,
    });

    if (!validation.success) {
      const fieldErrors: Record<string, string> = {};
      validation.error.issues.forEach((issue) => {
        fieldErrors[issue.path[0] as string] = issue.message;
      });
      setErrors(fieldErrors);
      return;
    }

    setErrors({});
    createUser.mutate(validation.data);
  };

  return (
    <Dialog open={open} onOpenChange={(newOpen) => {
      if (!newOpen) resetForm();
      onOpenChange(newOpen);
    }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" />
            Criar Usuário Manualmente
          </DialogTitle>
          <DialogDescription>
            Crie um usuário com nome de usuário e senha. O usuário deverá trocar a senha no primeiro login.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Username */}
          <div className="space-y-2">
            <Label htmlFor="username">Nome de Usuário</Label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase())}
                placeholder="joao.silva"
                className="pl-10"
                autoComplete="off"
              />
            </div>
            {errors.username && (
              <p className="text-sm text-destructive">{errors.username}</p>
            )}
          </div>

          {/* Full Name */}
          <div className="space-y-2">
            <Label htmlFor="full_name">Nome Completo</Label>
            <Input
              id="full_name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="João da Silva"
              autoComplete="off"
            />
            {errors.full_name && (
              <p className="text-sm text-destructive">{errors.full_name}</p>
            )}
          </div>

          {/* Password */}
          <div className="space-y-2">
            <Label htmlFor="password">Senha Temporária</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="pl-10 pr-10"
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {errors.password && (
              <p className="text-sm text-destructive">{errors.password}</p>
            )}

            {/* Password Strength Indicator */}
            {password && (
              <div className="space-y-2">
                <div className="flex gap-1">
                  {[1, 2, 3, 4].map((level) => (
                    <div
                      key={level}
                      className={`h-1 flex-1 rounded-full transition-colors ${
                        passwordStrength >= level
                          ? level <= 2
                            ? 'bg-destructive'
                            : level === 3
                            ? 'bg-warning'
                            : 'bg-primary'
                          : 'bg-muted'
                      }`}
                    />
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className={`flex items-center gap-1 ${passwordChecks.length ? 'text-primary' : 'text-muted-foreground'}`}>
                    {passwordChecks.length ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                    8+ caracteres
                  </div>
                  <div className={`flex items-center gap-1 ${passwordChecks.upper ? 'text-primary' : 'text-muted-foreground'}`}>
                    {passwordChecks.upper ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                    Maiúscula
                  </div>
                  <div className={`flex items-center gap-1 ${passwordChecks.lower ? 'text-primary' : 'text-muted-foreground'}`}>
                    {passwordChecks.lower ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                    Minúscula
                  </div>
                  <div className={`flex items-center gap-1 ${passwordChecks.number ? 'text-primary' : 'text-muted-foreground'}`}>
                    {passwordChecks.number ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                    Número
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Role */}
          <div className="space-y-2">
            <Label htmlFor="role">Função</Label>
            <Select value={role} onValueChange={(v) => setRole(v as AppRole)}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a função" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Administrador</SelectItem>
                <SelectItem value="operator">Operador</SelectItem>
                <SelectItem value="viewer">Visualizador</SelectItem>
              </SelectContent>
            </Select>
            {errors.role && (
              <p className="text-sm text-destructive">{errors.role}</p>
            )}
          </div>

          <Alert className="bg-muted/50">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="text-sm">
              O usuário será obrigado a trocar a senha no primeiro login por segurança.
            </AlertDescription>
          </Alert>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={createUser.isPending}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={createUser.isPending}>
              {createUser.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Criando...
                </>
              ) : (
                <>
                  <UserPlus className="mr-2 h-4 w-4" />
                  Criar Usuário
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
