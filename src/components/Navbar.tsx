import { Shield, Menu, X } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

export const Navbar = () => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
      setIsMobileMenuOpen(false);
    }
  };

  const whatsappLink = "https://wa.me/5534984432835?text=Olá!%20Gostaria%20de%20conhecer%20o%20CyberShield";

  return (
    <>
      <nav
        className={cn(
          "fixed top-0 left-0 right-0 z-50 transition-all duration-300",
          isScrolled
            ? "bg-background/95 backdrop-blur-md border-b border-border shadow-lg"
            : "bg-transparent"
        )}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link to="/" className="flex items-center gap-2 group">
              <div className="w-10 h-10 bg-gradient-to-br from-primary to-accent rounded-lg flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                <Shield className="w-6 h-6 text-primary-foreground" />
              </div>
              <span className="text-xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                CyberShield
              </span>
            </Link>

            {/* Desktop Menu */}
            <div className="hidden md:flex items-center gap-8">
              <button
                onClick={() => scrollToSection("inicio")}
                className="text-sm font-medium text-foreground/80 hover:text-foreground transition-colors"
              >
                Início
              </button>
              <button
                onClick={() => scrollToSection("recursos")}
                className="text-sm font-medium text-foreground/80 hover:text-foreground transition-colors"
              >
                Recursos
              </button>
              <button
                onClick={() => scrollToSection("precos")}
                className="text-sm font-medium text-foreground/80 hover:text-foreground transition-colors"
              >
                Preços
              </button>
              <button
                onClick={() => scrollToSection("contato")}
                className="text-sm font-medium text-foreground/80 hover:text-foreground transition-colors"
              >
                Contato
              </button>
            </div>

            {/* Desktop Actions */}
            <div className="hidden md:flex items-center gap-3">
              <Button
                asChild
                variant="default"
                size="sm"
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                <a href={whatsappLink} target="_blank" rel="noopener noreferrer">
                  WhatsApp
                </a>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link to="/login">Entrar</Link>
              </Button>
            </div>

            {/* Mobile Menu Button */}
            <button
              className="md:hidden p-2"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            >
              {isMobileMenuOpen ? (
                <X className="w-6 h-6" />
              ) : (
                <Menu className="w-6 h-6" />
              )}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {isMobileMenuOpen && (
          <div className="md:hidden bg-background border-t border-border">
            <div className="px-4 py-4 space-y-3">
              <button
                onClick={() => scrollToSection("inicio")}
                className="block w-full text-left px-4 py-2 text-sm font-medium text-foreground/80 hover:text-foreground hover:bg-muted rounded-lg transition-colors"
              >
                Início
              </button>
              <button
                onClick={() => scrollToSection("recursos")}
                className="block w-full text-left px-4 py-2 text-sm font-medium text-foreground/80 hover:text-foreground hover:bg-muted rounded-lg transition-colors"
              >
                Recursos
              </button>
              <button
                onClick={() => scrollToSection("precos")}
                className="block w-full text-left px-4 py-2 text-sm font-medium text-foreground/80 hover:text-foreground hover:bg-muted rounded-lg transition-colors"
              >
                Preços
              </button>
              <button
                onClick={() => scrollToSection("contato")}
                className="block w-full text-left px-4 py-2 text-sm font-medium text-foreground/80 hover:text-foreground hover:bg-muted rounded-lg transition-colors"
              >
                Contato
              </button>
              <div className="pt-3 border-t border-border space-y-2">
                <Button
                  asChild
                  variant="default"
                  size="sm"
                  className="w-full bg-green-600 hover:bg-green-700 text-white"
                >
                  <a href={whatsappLink} target="_blank" rel="noopener noreferrer">
                    WhatsApp
                  </a>
                </Button>
                <Button asChild variant="outline" size="sm" className="w-full">
                  <Link to="/login">Entrar</Link>
                </Button>
              </div>
            </div>
          </div>
        )}
      </nav>
      {/* Spacer to prevent content from being hidden under fixed navbar */}
      <div className="h-16" />
    </>
  );
};
