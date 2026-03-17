import { useState, useEffect } from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ThemeToggleProps {
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm" | "lg" | "icon";
  withLabel?: boolean;
  className?: string;
}

export function ThemeToggle({ 
  variant = "ghost", 
  size = "icon",
  withLabel = false,
  className 
}: ThemeToggleProps) {
  const [mounted, setMounted] = useState(false);
  const { resolvedTheme, setTheme } = useTheme();

  // Avoid hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = resolvedTheme === "dark";

  const toggleTheme = () => {
    const nextTheme = isDark ? "light" : "dark";
    setTheme(nextTheme);
    
  };

  // Show placeholder while mounting to avoid hydration issues
  if (!mounted) {
    return (
      <Button
        variant={variant}
        size={withLabel ? "default" : size}
        className={cn("opacity-50", className)}
        disabled
      >
        <Sun className="h-5 w-5" />
        {withLabel && <span className="ml-2">Carregando...</span>}
      </Button>
    );
  }

  return (
    <Button
      variant={variant}
      size={withLabel ? "default" : size}
      onClick={toggleTheme}
      className={cn(
        "transition-colors",
        className
      )}
      aria-label={isDark ? "Mudar para tema claro" : "Mudar para tema escuro"}
    >
      {isDark ? (
        <>
          <Sun className="h-5 w-5" />
          {withLabel && <span className="ml-2">Tema Claro</span>}
        </>
      ) : (
        <>
          <Moon className="h-5 w-5" />
          {withLabel && <span className="ml-2">Tema Escuro</span>}
        </>
      )}
    </Button>
  );
}
