import { ArrowRight, CheckCircle } from "lucide-react";
import cybershieldLogo from "@/assets/logo-cybshield-new.webp";
import heroBanner from "@/assets/cybershield-hero-banner.webp";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { useLandingContent } from "@/hooks/useLandingContent";
import { lazy, Suspense } from "react";

// Lazy load decorations — they are purely visual and not needed for FCP/LCP
const HeroDecorations = lazy(() => import("./shared/AnimatedDecorations").then(m => ({ default: m.HeroDecorations })));

export function HeroSection() {
  const { hero } = useLandingContent();

  return (
    <section id="inicio" className="relative min-h-screen flex items-center overflow-hidden py-32" aria-labelledby="hero-heading">
      {/* Refined Background - Ultra Premium Obsidian */}
      <div className="absolute inset-0 bg-[#020203] overflow-hidden">
        <div className="absolute top-[-20%] left-[-10%] w-[70%] h-[70%] bg-cta-positive/20 rounded-full blur-[160px] animate-pulse-subtle" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] bg-info/10 rounded-full blur-[140px]" />
      </div>
      
      {/* Dynamic light streak */}
      <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-cta-positive/50 to-transparent opacity-20" />

      {/* Subtle refined grid */}
      <div className="absolute inset-0 opacity-[0.05]" style={{
        backgroundImage: `linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)`,
        backgroundSize: '80px 80px'
      }} />

      <div className="relative max-w-7xl mx-auto px-6 lg:px-8 py-20 w-full">
        <div className="grid lg:grid-cols-2 gap-20 items-center">
          {/* Left: Text content */}
          <div className="space-y-10 animate-fade-in-left text-center lg:text-left">
            {/* Badge - Cyber Shield Premium */}
            <div className="inline-flex items-center gap-3 px-5 py-2 rounded-full glass-card border-cta-positive/30 shadow-glow">
              <div className="relative">
                <img src={cybershieldLogo} alt="" className="w-5 h-5 object-contain animate-pulse" aria-hidden="true" width={20} height={20} />
                <div className="absolute inset-0 bg-cta-positive/40 blur-sm rounded-full" />
              </div>
              <span className="text-[11px] font-bold tracking-[0.15em] uppercase text-cta-positive/90">{hero.badge}</span>
            </div>

            {/* Title — fluid scaling & high impact */}
            <h1 id="hero-heading" className="text-5xl sm:text-6xl md:text-7xl xl:text-[5.5rem] font-display font-extrabold tracking-tight leading-[1] text-balance">
              <span className="text-white drop-shadow-[0_10px_10px_rgba(0,0,0,0.5)]">
                {hero.title1}
              </span>
              <br />
              <span className="bg-gradient-to-r from-cta-positive via-emerald-300 to-cta-positive bg-clip-text text-transparent animate-gradient-x brightness-125 saturate-150">
                {hero.title2}
              </span>
            </h1>

            {/* Description */}
            <p className="text-lg md:text-xl text-white/60 max-w-xl mx-auto lg:mx-0 leading-relaxed text-pretty font-medium">
              {hero.description}
              <span className="text-white border-b border-cta-positive/40 pb-0.5 ml-1">{hero.descriptionBold}</span>
            </p>

            {/* Benefits */}
            {hero.benefits && (
              <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-3 sm:gap-3.5 pt-2 max-w-xl mx-auto lg:mx-0" aria-label="Benefícios principais">
                {hero.benefits.map((benefit, index) => (
                  <li
                    key={index}
                    className="flex items-center gap-3 sm:gap-3.5 text-white/85 group animate-fade-in-left text-left"
                    style={{ animationDelay: `${0.4 + index * 0.1}s` }}
                  >
                    <div className="flex-shrink-0 w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-cta-positive/20 flex items-center justify-center group-hover:bg-cta-positive/30 transition-colors duration-300">
                      <CheckCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-cta-positive" aria-hidden="true" />
                    </div>
                    <span className="text-sm md:text-base font-medium leading-tight group-hover:text-white transition-colors duration-300">{benefit}</span>
                  </li>
                ))}
              </ul>
            )}

            {/* CTA — stacks on mobile, side-by-side from sm+ */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center lg:justify-start gap-3 sm:gap-4 lg:gap-5 pt-4 sm:pt-6">
              <Button 
                asChild 
                size="lg" 
                variant="cta"
                className="w-full sm:w-auto text-base sm:text-lg h-14 sm:h-16 px-8 sm:px-12 font-bold rounded-full shadow-2xl shadow-cta-positive/20 hover:shadow-cta-positive/40 transition-all duration-500 ease-premium interactive-hover"
              >
                <Link to="/signup" aria-label="Descobrir se minha empresa está vulnerável - Começar agora">
                  <span className="truncate">{hero.ctaButton}</span>
                  <ArrowRight className="ml-2 sm:ml-3 h-5 w-5 sm:h-6 sm:w-6 flex-shrink-0 group-hover:translate-x-1 transition-transform duration-500" aria-hidden="true" />
                </Link>
              </Button>
              <Button 
                asChild 
                size="lg" 
                variant="outline"
                className="w-full sm:w-auto text-base sm:text-lg h-14 sm:h-16 px-8 sm:px-12 border-white/10 text-white/90 rounded-full bg-white/5 backdrop-blur-md hover:bg-white/10 hover:border-white/20 transition-all duration-500 ease-premium"
              >
                <a href="#mini-diagnostico" aria-label="Agendar diagnóstico gratuito de 15 minutos">
                  <span className="truncate">{hero.ctaSecondary || "Agendar diagnóstico gratuito"}</span>
                </a>
              </Button>
            </div>

            <p className="text-xs md:text-sm text-white/40 flex items-center justify-center lg:justify-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-cta-positive animate-pulse flex-shrink-0" />
              <span>{hero.reassurance}</span>
            </p>
          </div>

          {/* Right: visual — hidden on mobile/tablet, shown lg+ */}
          <div className="hidden lg:block animate-fade-in-up" style={{ animationDelay: '0.3s' }}>
            <div className="relative">
              <img 
                src={heroBanner} 
                alt="CyberShield - Segurança Operacional" 
                className="w-full rounded-2xl shadow-2xl shadow-cta-positive/20 border border-white/10"
                width={800}
                height={533}
                loading="eager"
                fetchPriority="high"
                decoding="async"
              />
              <div className="absolute -bottom-6 -left-6 right-12 space-y-3">
                {hero.stats.slice(0, 2).map((stat, index) => (
                  <div
                    key={index}
                    className="p-4 rounded-xl bg-background/80 border border-white/10 backdrop-blur-md shadow-lg animate-fade-in-left"
                    style={{ animationDelay: `${0.5 + index * 0.15}s` }}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm text-muted-foreground truncate">{stat.label}</span>
                      <span className="text-xl font-bold text-cta-positive flex-shrink-0">{stat.value}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom fade */}
      <div className="absolute bottom-0 left-0 right-0 h-16 sm:h-24 bg-gradient-to-t from-background to-transparent" />
    </section>
  );
}