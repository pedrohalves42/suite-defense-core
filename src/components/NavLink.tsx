import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';

interface NavLinkProps {
  to: string;
  children: React.ReactNode;
  className?: string;
  activeClassName?: string;
  end?: boolean;
  onClick?: () => void;
}

export const NavLink = ({ to, children, className, activeClassName, end = false, onClick }: NavLinkProps) => {
  const location = useLocation();
  const isActive = end 
    ? location.pathname === to 
    : location.pathname.startsWith(to);

  return (
    <Link to={to} onClick={onClick} className={cn(className, isActive && activeClassName)}>
      {children}
    </Link>
  );
};
