import { useState, useEffect } from "react";
import cybershieldLogo from "@/assets/logo-cybshield-new.png";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Minimal landing page navbar — no menu, just trust + CTA
 * Per wireframe: logo left, "Suporte em português" + demo button right
 */
export function LandingNavbar() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <nav className={cn(
      "fixed top-0 left-0 right-0 z-50 transition-all duration-300",
      scrolled 
        ? "bg-background/80 backdrop-blur-xl border-b border-border/40 shadow-sm" 
        : "bg-transparent border-b border-transparent"
    )}>
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-2.5 cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
          <img src={cybershieldLogo} alt="CyberShield" className="h-8 w-8 object-contain" />
          <span className={cn(
            "font-bold text-lg transition-colors",
            scrolled ? "text-foreground" : "text-primary-foreground"
          )}>CyberShield</span>
        </div>

        {/* Right: trust signal + CTA */}
        <div className="flex items-center gap-4">
          <span className={cn(
            "hidden sm:inline text-sm transition-colors",
            scrolled ? "text-muted-foreground" : "text-white/60"
          )}>
            Suporte em português
          </span>
          <Button 
            size="sm" 
            variant="outline"
            className={cn(
              "text-sm transition-colors",
              scrolled 
                ? "border-border text-foreground hover:bg-muted" 
                : "border-white/20 text-white hover:bg-white/10 hover:text-white"
            )}
            onClick={() => document.getElementById('contato')?.scrollIntoView({ behavior: 'smooth' })}
          >
            Agendar demo
          </Button>
        </div>
      </div>
    </nav>
  );
}
