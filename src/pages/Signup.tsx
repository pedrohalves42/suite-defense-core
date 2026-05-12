import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export default function Signup() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-[hsl(220,20%,10%)] via-[hsl(200,18%,12%)] to-[hsl(160,15%,10%)] z-0" />
      <Card className="w-full max-w-[460px] border border-white/10 bg-[hsl(220,20%,10%)]/60 backdrop-blur-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] relative z-10 rounded-3xl overflow-hidden p-12 text-center">
        <h1 className="text-2xl font-bold text-white mb-4">Cadastros Temporariamente Suspensos</h1>
        <p className="text-white/60 mb-8">
          Estamos em período de manutenção e estabilização do sistema. 
          Novos cadastros estão desativados no momento.
        </p>
        <Link to="/login">
          <Button variant="outline" className="w-full">Voltar para Login</Button>
        </Link>
      </Card>
    </div>
  );
}
