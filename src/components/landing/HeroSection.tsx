import { ArrowRight, CheckCircle, Shield, Zap } from "lucide-react";
import cybershieldLogo from "@/assets/logo-cybshield-new.png";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { useLandingContent } from "@/hooks/useLandingContent";
import { motion } from "framer-motion";

export function HeroSection() {
  const { hero } = useLandingContent();

  return (
    <section id="inicio" className="relative min-h-[90vh] flex items-center overflow-hidden" aria-labelledby="hero-heading">
      {/* Dark gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary via-primary/95 to-primary/80" />
      
      {/* Subtle grid pattern */}
      <div className="absolute inset-0 opacity-[0.03]" style={{
        backgroundImage: `radial-gradient(circle at 1px 1px, hsl(var(--primary-foreground)) 1px, transparent 0)`,
        backgroundSize: '40px 40px'
      }} />

      {/* Accent glow */}
      <div className="absolute top-1/4 right-1/4 w-[500px] h-[500px] bg-accent/10 rounded-full blur-[120px]" />
      <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-accent/5 rounded-full blur-[100px]" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 w-full">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          {/* Left: Text content */}
          <motion.div 
            className="space-y-8"
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          >
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-accent/15 border border-accent/25 backdrop-blur-sm">
              <img src={cybershieldLogo} alt="" className="w-5 h-5 object-contain" aria-hidden="true" />
              <span className="text-sm font-medium text-accent">{hero.badge}</span>
            </div>

            {/* Title */}
            <h1 id="hero-heading" className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.1]">
              <span className="text-primary-foreground">
                {hero.title1}
              </span>
              <br />
              <span className="text-accent">{hero.title2}</span>
            </h1>

            {/* Description */}
            <p className="text-lg text-primary-foreground/70 max-w-xl leading-relaxed">
              {hero.description}
              <strong className="text-primary-foreground font-semibold">{hero.descriptionBold}</strong>
            </p>

            {/* Benefits */}
            {hero.benefits && (
              <ul className="space-y-3" aria-label="Beneficios principais">
                {hero.benefits.map((benefit, index) => (
                  <motion.li
                    key={index}
                    className="flex items-center gap-3 text-primary-foreground/80"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.3 + index * 0.1 }}
                  >
                    <CheckCircle className="w-5 h-5 text-accent flex-shrink-0" aria-hidden="true" />
                    <span className="text-sm md:text-base">{benefit}</span>
                  </motion.li>
                ))}
              </ul>
            )}

            {/* CTA */}
            <div className="flex flex-col sm:flex-row gap-4 pt-4">
              <Button 
                asChild 
                size="lg" 
                className="text-lg h-14 px-8 bg-accent hover:bg-accent/90 text-accent-foreground font-semibold shadow-lg shadow-accent/20"
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
                className="text-lg h-14 px-8 border-primary-foreground/20 text-primary-foreground hover:bg-primary-foreground/10"
              >
                <a href="#mini-diagnostico" aria-label="Agendar diagnóstico gratuito">
                  {hero.ctaSecondary || "Agendar diagnóstico gratuito de 15 min"}
                </a>
              </Button>
            </div>

            <p className="text-sm text-primary-foreground/50">{hero.reassurance}</p>
          </motion.div>

          {/* Right: Stats + visual */}
          <motion.div 
            className="hidden lg:block"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
          >
            <div className="relative">
              {/* Floating stats cards */}
              <div className="space-y-4">
                {hero.stats.map((stat, index) => (
                  <motion.div
                    key={index}
                    className="p-5 rounded-2xl bg-primary-foreground/5 border border-primary-foreground/10 backdrop-blur-sm"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.5 + index * 0.15 }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-primary-foreground/60">{stat.label}</span>
                      <span className="text-2xl font-bold text-accent">{stat.value}</span>
                    </div>
                  </motion.div>
                ))}
              </div>

              {/* Security shield visual */}
              <motion.div 
                className="absolute -top-8 -right-8 w-32 h-32 flex items-center justify-center"
                animate={{ rotate: [0, 5, -5, 0] }}
                transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
              >
                <div className="relative">
                  <Shield className="w-20 h-20 text-accent/20" />
                  <Zap className="w-8 h-8 text-accent absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                </div>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Bottom fade */}
      <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-background to-transparent" />
    </section>
  );
}
