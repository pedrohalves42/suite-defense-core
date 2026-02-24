import { ArrowRight, CheckCircle } from "lucide-react";
import cybershieldLogo from "@/assets/cybershield-logo.png";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { StatCard } from "./shared/StatCard";
import { useLandingContent } from "@/hooks/useLandingContent";

export function HeroSection() {
  const { hero } = useLandingContent();

  return (
    <section id="inicio" className="relative overflow-hidden" aria-labelledby="hero-heading">
      {/* Subtle background */}
      <div className="absolute inset-0 bg-gradient-to-b from-muted/40 to-background" />
      
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-24">
        <div className="text-center space-y-8 animate-fade-in">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-accent/10 border border-accent/20">
            <img src={cybershieldLogo} alt="" className="w-5 h-5 object-contain" aria-hidden="true" />
            <span className="text-sm font-medium text-foreground">{hero.badge}</span>
          </div>

          {/* Title */}
          <h1 id="hero-heading" className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight">
            <span className="text-foreground">
              {hero.title1}
            </span>
            <br />
            <span className="text-muted-foreground">{hero.title2}</span>
          </h1>

          {/* Description */}
          <p className="text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
            {hero.description}
            <strong className="text-foreground font-semibold">{hero.descriptionBold}</strong>
          </p>

          {/* Benefits List */}
          {hero.benefits && (
            <ul className="flex flex-wrap justify-center gap-4 pt-2" aria-label="Beneficios principais">
              {hero.benefits.map((benefit, index) => (
                <li key={index} className="flex items-center gap-2 text-sm md:text-base text-muted-foreground">
                  <CheckCircle className="w-4 h-4 text-accent flex-shrink-0" aria-hidden="true" />
                  <span>{benefit}</span>
                </li>
              ))}
            </ul>
          )}

          {/* Stats */}
          <div className="flex flex-wrap justify-center gap-6 pt-4" role="list" aria-label="Estatisticas">
            {hero.stats.map((stat, index) => (
              <StatCard key={index} value={stat.value} label={stat.label} />
            ))}
          </div>

          {/* CTA */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center pt-8">
            <Button 
              asChild 
              size="lg" 
              className="text-lg h-14 px-8 btn-enterprise"
            >
              <Link to="/signup" aria-label="Descobrir se minha empresa está vulnerável">
                {hero.ctaButton}
                <ArrowRight className="ml-2 h-5 w-5" aria-hidden="true" />
              </Link>
            </Button>
            <Button 
              asChild 
              size="lg" 
              variant="outline"
              className="text-lg h-14 px-8"
            >
              <a href="#mini-diagnostico" aria-label="Agendar diagnóstico gratuito">
                {hero.ctaSecondary || "Agendar diagnóstico gratuito de 15 min"}
              </a>
            </Button>
          </div>

          <p className="text-sm text-muted-foreground">{hero.reassurance}</p>
        </div>
      </div>
    </section>
  );
}
