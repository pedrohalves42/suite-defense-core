import { ArrowRight, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { useLandingContent } from "@/hooks/useLandingContent";
import { motion } from "framer-motion";

export function CTASection() {
  const { ctaFinal } = useLandingContent();

  return (
    <section className="py-24 relative overflow-hidden">
      {/* Dark background with accent glow */}
      <div className="absolute inset-0 bg-primary" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-accent/15 rounded-full blur-[120px]" />
      
      <motion.div 
        className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center"
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
      >
        <h2 className="text-3xl md:text-4xl font-bold mb-8 text-primary-foreground leading-tight">
          {ctaFinal.title}
        </h2>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Button 
            asChild 
            size="lg" 
            variant="cta"
            className="text-lg h-14 px-10 font-semibold"
          >
            <Link to="/signup">
              {ctaFinal.cta}
              <ArrowRight className="ml-2 h-5 w-5" />
            </Link>
          </Button>
          <Button 
            asChild 
            size="lg" 
            variant="outline"
            className="text-lg h-14 px-10 border-accent/40 text-accent hover:bg-accent/10 hover:text-accent"
          >
            <a href="#mini-diagnostico">
              <Calendar className="mr-2 h-5 w-5" />
              {ctaFinal.ctaSecondary || "Agendar diagnóstico de 15 min"}
            </a>
          </Button>
        </div>
        <p className="text-sm text-primary-foreground/50 mt-6">{ctaFinal.subtitle}</p>
      </motion.div>
    </section>
  );
}
