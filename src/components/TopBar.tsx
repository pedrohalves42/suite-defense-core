import { Menu, Bell } from "lucide-react";
import cybershieldLogo from "@/assets/cybershield-logo.png";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface TopBarProps {
  isMobile: boolean;
  sidebarCollapsed: boolean;
  onMobileMenuClick: () => void;
}

export const TopBar = ({ isMobile, sidebarCollapsed, onMobileMenuClick }: TopBarProps) => {
  return (
    <header className={cn(
      "fixed top-0 right-0 z-30 h-14 border-b border-border/40 bg-background/80 backdrop-blur-md flex items-center justify-between px-4",
      isMobile ? "left-0" : (sidebarCollapsed ? "left-16" : "left-52"),
      "transition-all duration-300"
    )}>
      <div className="flex items-center gap-3">
        {isMobile && (
          <Button variant="ghost" size="icon" onClick={onMobileMenuClick} className="h-9 w-9">
            <Menu className="h-5 w-5" />
          </Button>
        )}
        <div className="flex items-center gap-2">
          <img src={cybershieldLogo} alt="CyberShield" className="h-7 w-7 object-contain" />
          <span className="font-semibold text-sm text-foreground hidden sm:inline">CyberShield</span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="h-9 w-9 relative">
          <Bell className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
};
