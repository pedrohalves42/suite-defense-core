import { useState } from "react";
import { Menu, X } from "lucide-react";
import cybershieldLogo from "@/assets/cybershield-logo.png";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

const navLinks = [
  { label: "Recursos", href: "#recursos" },
  { label: "Preços", href: "#precos" },
  { label: "Depoimentos", href: "#depoimentos" },
  { label: "FAQ", href: "#faq" },
  { label: "Contato", href: "#contato" },
];

export const Navbar = () => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();

  const scrollTo = (href: string) => {
    setMobileOpen(false);
    const el = document.querySelector(href);
    el?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-border/40">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate("/")}>
          <img src={cybershieldLogo} alt="CyberShield" className="h-8 w-8 object-contain" />
          <span className="font-bold text-lg text-foreground">CyberShield</span>
        </div>

        {/* Desktop links */}
        <div className="hidden md:flex items-center gap-6">
          {navLinks.map((link) => (
            <button
              key={link.href}
              onClick={() => scrollTo(link.href)}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              {link.label}
            </button>
          ))}
          <Button size="sm" onClick={() => navigate("/login")}>
            Entrar
          </Button>
        </div>

        {/* Mobile toggle */}
        <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setMobileOpen(!mobileOpen)}>
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
      </div>

      {/* Mobile menu */}
      <div className={cn(
        "md:hidden overflow-hidden transition-all duration-300 bg-background border-b border-border/40",
        mobileOpen ? "max-h-80" : "max-h-0"
      )}>
        <div className="px-4 py-3 space-y-2">
          {navLinks.map((link) => (
            <button
              key={link.href}
              onClick={() => scrollTo(link.href)}
              className="block w-full text-left text-sm py-2 text-muted-foreground hover:text-foreground"
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
