import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { LogOut } from 'lucide-react';

export const LogoutButton = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    
    if (error) {
      toast({
        variant: 'destructive',
        title: 'Erro ao sair',
        description: error.message,
      });
    } else {
      toast({
        title: 'Logout realizado',
        description: 'Até logo!',
      });
      navigate('/login');
    }
  };

  return (
    <Button variant="outline" size="sm" onClick={handleLogout}>
      <LogOut className="mr-2 h-4 w-4" />
      Sair
    </Button>
  );
};
