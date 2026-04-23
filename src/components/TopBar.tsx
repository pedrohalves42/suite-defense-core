import { Menu, Bell } from "lucide-react";
import { memo } from "react";
import cybershieldLogo from "@/assets/logo-cybshield-new.webp";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface TopBarProps {
  isMobile: boolean;
  sidebarCollapsed: boolean;
  onMobileMenuClick: () => void;
}

export const TopBar = memo(({ isMobile, sidebarCollapsed, onMobileMenuClick }: TopBarProps) => {
  return (
// ... keep existing code
  );
});

TopBar.displayName = 'TopBar';