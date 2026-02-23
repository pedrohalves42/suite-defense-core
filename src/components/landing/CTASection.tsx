import { ArrowRight, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { useLandingContent } from "@/hooks/useLandingContent";

export function CTASection() {
  const { ctaFinal } = useLandingContent();

  return (
    <section className="py-16 bg-accent text-white">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <h2 className="text-2xl md:text-3xl font-bold mb-6 text-white">
          {ctaFinal.title}
        </h2>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Button 
            asChild 
            size="lg" 
            className="text-lg h-14 px-10 bg-white text-accent hover:bg-white/90 font-semibold"
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
            className="text-lg h-14 px-10 border-white/40 text-white hover:bg-white/10"
          >
            <a href="#mini-diagnostico">
              <Calendar className="mr-2 h-5 w-5" />
              {ctaFinal.ctaSecondary || "Agendar diagnóstico de 15 min"}
            </a>
          </Button>
        </div>
        <p className="text-sm text-white/70 mt-4">{ctaFinal.subtitle}</p>
      </div>
    </section>
  );
}
