import { Menu, X } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { CONTACT } from "@/constants/config";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useTranslation } from "react-i18next";
import logoImage from '@/assets/logo-cybshield-new.png';

const NAV_KEYS = [
  { id: "inicio", key: "nav.home" },
  { id: "recursos", key: "nav.features" },
  { id: "precos", key: "nav.pricing" },
  { id: "contato", key: "nav.contact" }
];

export const Navbar = () => {
  const { t } = useTranslation();
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [activeSection, setActiveSection] = useState("inicio");

  const NAV_SECTIONS = NAV_KEYS.map(n => ({ id: n.id, label: t(n.key) }));

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        });
      },
      { 
        threshold: 0.3,
        rootMargin: "-80px 0px -50% 0px"
      }
    );

    NAV_SECTIONS.forEach(({ id }) => {
      const element = document.getElementById(id);
      if (element) observer.observe(element);
    });

    return () => observer.disconnect();
  }, []);

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
      setIsMobileMenuOpen(false);
    }
  };

  const whatsappLink = `${CONTACT.WHATSAPP_LINK}?text=${CONTACT.WHATSAPP_TEXT_DEFAULT}`;

  return (
    <>
      <nav className={cn(
        "fixed top-0 left-0 right-0 z-50 transition-all duration-300",
        isScrolled 
          ? "bg-card/95 backdrop-blur-md border-b border-border shadow-premium" 
          : "bg-transparent"
      )}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link to="/" className="flex items-center gap-2.5">
              <img 
                src={logoImage} 
                alt="CyberShield Logo" 
                className="h-8 w-auto object-contain"
              />
              <span className="text-lg font-bold text-foreground tracking-tight">
                CyberShield
              </span>
            </Link>

            {/* Desktop Menu */}
            <div className="hidden md:flex items-center gap-8">
              {NAV_SECTIONS.map(({ id, label }) => (
                <button
                  key={id}
                  onClick={() => scrollToSection(id)}
                  className={cn(
                    "text-sm font-medium transition-colors relative",
                    activeSection === id 
                      ? "text-foreground" 
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {label}
                  {activeSection === id && (
                    <span className="absolute -bottom-1 left-0 right-0 h-0.5 bg-accent rounded-full" />
                  )}
                </button>
              ))}
            </div>

            {/* Desktop Actions */}
            <div className="hidden md:flex items-center gap-3">
              <LanguageSwitcher />
              <ThemeToggle className="h-9 w-9" />
              <Button 
                asChild 
                variant="default" 
                size="sm" 
                className="bg-success hover:bg-success/90 text-success-foreground"
              >
                <a href={whatsappLink} target="_blank" rel="noopener noreferrer">
                  {t('nav.whatsapp')}
                </a>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link to="/login">{t('nav.login')}</Link>
              </Button>
            </div>

            {/* Mobile Menu Button */}
            <button 
              className="md:hidden p-2" 
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              aria-label="Toggle menu"
            >
              {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        <div className={cn(
          "md:hidden overflow-hidden transition-all duration-300 ease-in-out",
          isMobileMenuOpen 
            ? "max-h-96 opacity-100 bg-card border-t border-border" 
            : "max-h-0 opacity-0"
        )}>
          <div className="px-4 py-4 space-y-2">
            {NAV_SECTIONS.map(({ id, label }) => (
              <button
                key={id}
                onClick={() => scrollToSection(id)}
                className={cn(
                  "block w-full text-left px-4 py-2 text-sm font-medium rounded-lg transition-colors",
                  activeSection === id 
                    ? "bg-accent/10 text-foreground" 
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
              >
                {label}
              </button>
            ))}
            <div className="pt-3 border-t border-border space-y-2">
              <LanguageSwitcher variant="full" />
              <ThemeToggle variant="outline" withLabel className="w-full justify-start" />
              <Button 
                asChild 
                variant="default" 
                size="sm" 
                className="w-full bg-success hover:bg-success/90 text-success-foreground"
              >
                <a href={whatsappLink} target="_blank" rel="noopener noreferrer">
                  {t('nav.whatsapp')}
                </a>
              </Button>
              <Button asChild variant="outline" size="sm" className="w-full">
                <Link to="/login">{t('nav.login')}</Link>
              </Button>
            </div>
          </div>
        </div>
      </nav>

      <div className="h-16" />
    </>
  );
};
