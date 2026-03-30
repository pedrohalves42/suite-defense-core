import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

export function NavButton({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <Button asChild variant="outline" className="h-auto py-3.5 flex-col gap-1.5">
      <Link to={to}>
        {icon}
        <span className="text-xs">{label}</span>
      </Link>
    </Button>
  );
}
