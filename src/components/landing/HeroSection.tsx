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
    <section id="inicio" className="relative min-h-[90vh] flex items-center overflow-hidden" aria-labelledby="hero-heading">
      {/* Deep blue-green gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-[hsl(220,20%,10%)] via-[hsl(200,18%,12%)] to-[hsl(160,15%,10%)]" />
      
      {/* Subtle grid pattern */}
      <div className="absolute inset-0 opacity-[0.03]" style={{
        backgroundImage: `radial-gradient(circle at 1px 1px, hsl(var(--primary-foreground)) 1px, transparent 0)`,
        backgroundSize: '40px 40px'
      }} />

      {/* Green security glow */}
      <div className="absolute top-1/4 right-1/4 w-[500px] h-[500px] bg-cta-positive/8 rounded-full blur-[150px]" />
      <div className="absolute bottom-1/4 left-0 w-[400px] h-[400px] bg-info/5 rounded-full blur-[120px]" />
      
      {/* Decorations — deferred so they don't block FCP */}
      <Suspense fallback={null}>
        <HeroDecorations />
      </Suspense>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 w-full">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          {/* Left: Text content — CSS animations instead of framer-motion */}
          <div className="space-y-8 animate-fade-in-left">
            {/* Badge */}
            <div className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full bg-cta-positive/10 border border-cta-positive/20 backdrop-blur-md shadow-sm animate-pulse-subtle">
              <img src={cybershieldLogo} alt="" className="w-5 h-5 object-contain" aria-hidden="true" width={20} height={20} />
              <span className="text-xs md:text-sm font-bold tracking-wide uppercase text-cta-positive">{hero.badge}</span>
            </div>

            {/* Title */}
            <h1 id="hero-heading" className="text-4xl md:text-5xl lg:text-7xl font-extrabold tracking-tight leading-[1.05] text-balance">
              <span className="text-white drop-shadow-sm">
                {hero.title1}
              </span>
              <br />
              <span className="bg-gradient-to-r from-cta-positive via-emerald-400 to-shield-active bg-clip-text text-transparent animate-gradient-x">
                {hero.title2}
              </span>
            </h1>

            {/* Description */}
            <p className="text-lg md:text-xl text-white/70 max-w-xl leading-relaxed text-pretty font-medium">
              {hero.description}
              <strong className="text-white font-bold ml-1 border-b-2 border-cta-positive/30 pb-0.5">{hero.descriptionBold}</strong>
            </p>

            {/* Benefits */}
            {hero.benefits && (
              <ul className="grid sm:grid-cols-1 gap-3.5 pt-2" aria-label="Benefícios principais">
                {hero.benefits.map((benefit, index) => (
                  <li
                    key={index}
                    className="flex items-center gap-3.5 text-white/85 group animate-fade-in-left"
                    style={{ animationDelay: `${0.4 + index * 0.1}s` }}
                  >
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-cta-positive/20 flex items-center justify-center group-hover:bg-cta-positive/30 transition-colors duration-300">
                      <CheckCircle className="w-4 h-4 text-cta-positive" aria-hidden="true" />
                    </div>
                    <span className="text-sm md:text-base font-medium leading-tight group-hover:text-white transition-colors duration-300">{benefit}</span>
                  </li>
                ))}
              </ul>
            )}

            {/* CTA */}
            <div className="flex flex-col sm:flex-row items-center gap-5 pt-6">
              <Button 
                asChild 
                size="lg" 
                variant="cta"
                className="w-full sm:w-auto text-lg h-16 px-10 font-bold rounded-full shadow-2xl shadow-cta-positive/30 hover:shadow-cta-positive/50 transition-all duration-300 interactive-hover"
              >
                <Link to="/signup" aria-label="Descobrir se minha empresa está vulnerável - Começar agora">
                  {hero.ctaButton}
                  <ArrowRight className="ml-3 h-6 w-6 group-hover:translate-x-1 transition-transform" aria-hidden="true" />
                </Link>
              </Button>
              <Button 
                asChild 
                size="lg" 
                variant="outline"
                className="w-full sm:w-auto text-lg h-16 px-10 border-white/20 text-white rounded-full bg-white/5 backdrop-blur-sm hover:bg-white/10 hover:border-white/40 transition-all duration-300 focus-ring"
              >
                <a href="#mini-diagnostico" aria-label="Agendar diagnóstico gratuito de 15 minutos">
                  {hero.ctaSecondary || "Agendar diagnóstico gratuito"}
                </a>
              </Button>
            </div>

            <p className="text-xs md:text-sm text-white/40 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-cta-positive animate-pulse" />
              {hero.reassurance}
            </p>
          </div>

          {/* Right: Stats + visual — only rendered on desktop (lg+) */}
          <div className="hidden lg:block animate-fade-in-up" style={{ animationDelay: '0.3s' }}>
            <div className="relative">
              <img 
                src={heroBanner} 
                alt="CyberShield - Segurança Operacional" 
                className="w-full rounded-2xl shadow-2xl shadow-cta-positive/20 border border-white/10"
                width={1200}
                height={800}
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
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">{stat.label}</span>
                      <span className="text-xl font-bold text-cta-positive">{stat.value}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom fade */}
      <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-background to-transparent" />
    </section>
  );
}