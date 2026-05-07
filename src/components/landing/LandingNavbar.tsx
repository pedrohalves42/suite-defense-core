import { useState, useEffect, Suspense, lazy } from "react";
import { Link } from "react-router-dom";
import cybershieldLogo from "@/assets/logo-cybshield-new.webp";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LogIn } from "lucide-react";

const LanguageSwitcher = lazy(() => import("@/components/LanguageSwitcher").then(m => ({ default: m.LanguageSwitcher })));
const ThemeToggle = lazy(() => import("@/components/ThemeToggle").then(m => ({ default: m.ThemeToggle })));

/**
 * Minimal landing page navbar — logo left, trust + login + CTA right
 */
export function LandingNavbar() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <nav 
      role="navigation"
      aria-label="Navegação Principal"
      className={cn(
        "fixed top-0 left-0 right-0 z-50 transition-all duration-500",
        scrolled 
          ? "bg-[#020203]/80 backdrop-blur-2xl border-b border-white/5 py-2 shadow-2xl" 
          : "bg-transparent border-b border-transparent py-6"
      )}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link 
          to="/" 
          className="flex items-center gap-2.5 group transition-transform duration-300 hover:scale-105"
          onClick={(e) => {
            if (window.location.pathname === '/') {
              e.preventDefault();
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }
          }}
          aria-label="CyberShield - Voltar ao topo"
        >
          <div className="relative group-hover:scale-110 transition-transform duration-500">
            <img src={cybershieldLogo} alt="" className="h-10 w-10 object-contain group-hover:rotate-12 transition-transform duration-500" aria-hidden="true" width={40} height={40} />
            <div className="absolute inset-0 bg-cta-positive/40 rounded-full blur-lg opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          <span className={cn(
            "font-display font-bold text-2xl tracking-tighter transition-colors duration-500",
            scrolled ? "text-white" : "text-white"
          )}>CyberShield</span>
        </Link>

        {/* Right: trust signal + login + CTA */}
        <div className="flex items-center gap-2 md:gap-4">
          <div className="hidden md:flex items-center gap-4 mr-2 pr-4 border-r border-white/5">
            <Suspense fallback={<div className="w-8 h-8 rounded-full bg-muted animate-pulse" />}>
              <LanguageSwitcher 
                className={cn(
                  "h-9 w-9 rounded-full transition-all duration-300",
                  scrolled 
                    ? "text-foreground hover:bg-muted" 
                    : "text-white/80 hover:bg-white/10 hover:text-white"
                )}
              />
              <ThemeToggle 
                variant="ghost" 
                size="icon" 
                className={cn(
                  "h-9 w-9 rounded-full transition-all duration-300",
                  scrolled 
                    ? "text-foreground hover:bg-muted" 
                    : "text-white/80 hover:bg-white/10 hover:text-white"
                )}
              />
            </Suspense>
          </div>

          <span className={cn(
            "hidden lg:inline text-[10px] font-bold uppercase tracking-[0.2em] transition-colors duration-500",
            scrolled ? "text-white/40" : "text-white/40"
          )}>
            Suporte 24/7 PT-BR
          </span>

          <Link to="/login" className="focus-ring rounded-full">
            <Button 
              size="sm" 
              variant="ghost"
              className={cn(
                "text-sm font-semibold gap-2 px-6 h-11 rounded-full transition-all duration-500",
                scrolled 
                  ? "text-white/90 hover:bg-white/10" 
                  : "text-white/90 hover:bg-white/10"
              )}
            >
              <LogIn className="h-4 w-4" aria-hidden="true" />
              Entrar
            </Button>
          </Link>
          
          <Button 
            size="sm" 
            variant="cta"
            className="hidden sm:flex text-sm font-bold h-11 px-8 rounded-full shadow-2xl shadow-cta-positive/20 interactive-hover border border-white/10"
            onClick={() => document.getElementById('contato')?.scrollIntoView({ behavior: 'smooth' })}
            aria-label="Agendar uma demonstração gratuita"
          >
            Agendar demo
          </Button>
        </div>
      </div>
    </nav>
  );
}