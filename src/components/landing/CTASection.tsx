import { ArrowRight, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { useLandingContent } from "@/hooks/useLandingContent";
import { motion } from "framer-motion";

export function CTASection() {
  const { ctaFinal } = useLandingContent();

  return (
    <section className="py-24 relative overflow-hidden">
      {/* Deep green-tinted dark — "final safe zone" feeling */}
      <div className="absolute inset-0 bg-gradient-to-br from-[hsl(220,18%,10%)] via-[hsl(160,12%,10%)] to-[hsl(220,18%,10%)]" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-cta-positive/12 rounded-full blur-[150px]" />
      <div className="absolute bottom-0 right-0 w-[400px] h-[300px] bg-info/5 rounded-full blur-[120px]" />
      
      <motion.div 
        className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center"
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
      >
        <h2 className="text-3xl md:text-4xl font-bold mb-8 text-white leading-tight">
          {ctaFinal.title}
        </h2>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Button 
            asChild 
            size="lg" 
            variant="cta"
            className="text-lg h-14 px-10 font-semibold shadow-lg shadow-cta-positive/25"
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
            className="text-lg h-14 px-10 border-white/20 text-white hover:bg-white/10"
          >
            <a href="#mini-diagnostico">
              <Calendar className="mr-2 h-5 w-5" />
              {ctaFinal.ctaSecondary || "Agendar diagnóstico de 15 min"}
            </a>
          </Button>
        </div>
        <p className="text-sm text-white/40 mt-6">{ctaFinal.subtitle}</p>
      </motion.div>
    </section>
  );
}