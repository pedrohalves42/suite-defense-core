import { Menu, Bell } from "lucide-react";
import { memo } from "react";
import cybershieldLogo from "@/assets/logo-cybshield-new.webp";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface TopBarProps {
  isMobile: boolean;
  sidebarCollapsed: boolean;
  mobileMenuOpen?: boolean;
  onMobileMenuClick: () => void;
}

export const TopBar = memo(({ isMobile, sidebarCollapsed, mobileMenuOpen, onMobileMenuClick }: TopBarProps) => {
  return (
    <header className={cn(
      "fixed top-0 right-0 z-30 h-16 border-b border-white/5 bg-[#020203]/70 backdrop-blur-2xl flex items-center justify-between px-6 md:px-10 shadow-sm",
      isMobile ? "left-0" : (sidebarCollapsed ? "left-[calc(4rem+16px)]" : "left-[calc(14rem+16px)]"),
      "transition-all duration-500 ease-premium"
    )} role="banner">
      <div className="flex items-center gap-3">
        {isMobile && (
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={onMobileMenuClick} 
            className="h-9 w-9 interactive-hover" 
            aria-label="Abrir menu lateral"
            aria-expanded={mobileMenuOpen}
          >
            <Menu className="h-5 w-5" />
          </Button>
        )}
        <div className="flex items-center gap-2 group cursor-default">
          <img src={cybershieldLogo} alt="CyberShield" className="h-7 w-7 object-contain transition-transform duration-300 group-hover:rotate-12" />
          <span className="font-semibold text-sm text-foreground hidden sm:inline tracking-tight">CyberShield</span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-9 w-9 relative interactive-hover" 
          aria-label="Ver notificações"
        >
          <Bell className="h-4 w-4" />
          <span className="absolute top-2 right-2 w-2 h-2 bg-destructive rounded-full border-2 border-background" aria-hidden="true" />
        </Button>
      </div>
    </header>
  );
});

TopBar.displayName = 'TopBar';
