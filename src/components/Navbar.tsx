import { useState, useEffect } from "react";
import { Menu, X } from "lucide-react";
import cybershieldLogo from "@/assets/logo-cybshield-new.png";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

const navLinks = [
  { label: "Recursos", href: "#recursos" },
  { label: "Preços", href: "#precos" },
  { label: "Tutoriais", href: "/tutorials", isRoute: true },
  { label: "FAQ", href: "#faq" },
  { label: "Contato", href: "#contato" },
];

export const Navbar = () => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const handleNavClick = (link: typeof navLinks[0]) => {
    setMobileOpen(false);
    if ((link as any).isRoute) {
      navigate(link.href);
    } else {
      const el = document.querySelector(link.href);
      el?.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <nav className={cn(
      "fixed top-0 left-0 right-0 z-50 transition-all duration-300",
      scrolled 
        ? "bg-background/80 backdrop-blur-xl border-b border-border/40 shadow-sm" 
        : "bg-transparent border-b border-transparent"
    )}>
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2.5 cursor-pointer" onClick={() => navigate("/")}>
          <img src={cybershieldLogo} alt="CyberShield" className="h-8 w-8 object-contain" />
          <span className={cn(
            "font-bold text-lg transition-colors",
            scrolled ? "text-foreground" : "text-primary-foreground"
          )}>CyberShield</span>
        </div>

        {/* Desktop links */}
        <div className="hidden md:flex items-center gap-8">
          {navLinks.map((link) => (
            <button
              key={link.href}
              onClick={() => handleNavClick(link)}
              className={cn(
                "text-sm font-medium transition-colors",
                scrolled 
                  ? "text-muted-foreground hover:text-foreground" 
                  : "text-primary-foreground/70 hover:text-primary-foreground"
              )}
            >
              {link.label}
            </button>
          ))}
          <Button 
            size="sm" 
            onClick={() => navigate("/login")}
            className={cn(
              scrolled 
                ? "bg-primary text-primary-foreground" 
                : "bg-accent text-accent-foreground hover:bg-accent/90"
            )}
          >
            Entrar
          </Button>
        </div>

        {/* Mobile toggle */}
        <Button 
          variant="ghost" 
          size="icon" 
          className={cn("md:hidden", !scrolled && "text-primary-foreground")} 
          onClick={() => setMobileOpen(!mobileOpen)}
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
      </div>

      {/* Mobile menu */}
      <div className={cn(
        "md:hidden overflow-hidden transition-all duration-300 bg-background/95 backdrop-blur-xl border-b border-border/40",
        mobileOpen ? "max-h-80" : "max-h-0"
      )}>
        <div className="px-4 py-3 space-y-2">
          {navLinks.map((link) => (
            <button
              key={link.href}
              onClick={() => handleNavClick(link)}
              className="block w-full text-left text-sm py-2.5 text-muted-foreground hover:text-foreground font-medium"
            >
              {link.label}
            </button>
          ))}
          <Button className="w-full mt-2" size="sm" onClick={() => { setMobileOpen(false); navigate("/login"); }}>
            Entrar
          </Button>
        </div>
      </div>
    </nav>
  );
};
