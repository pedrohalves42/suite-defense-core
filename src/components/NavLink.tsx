import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';

interface NavLinkProps {
  to: string;
  children: React.ReactNode;
  className?: string;
  activeClassName?: string;
  end?: boolean;
  onClick?: () => void;
  onMouseEnter?: () => void;
}

export const NavLink = ({ to, children, className, activeClassName, end = false, onClick, onMouseEnter }: NavLinkProps) => {
  const location = useLocation();
  const isActive = end 
    ? location.pathname === to 
    : location.pathname.startsWith(to);

  return (
    <Link 
      to={to} 
      onClick={onClick} 
      onMouseEnter={onMouseEnter}
      className={cn(className, isActive && activeClassName)}
    >
      {children}
    </Link>
  );
};
