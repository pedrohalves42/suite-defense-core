import { ArrowRight, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { useLandingContent } from "@/hooks/useLandingContent";

export function CTASection() {
  const { ctaFinal } = useLandingContent();

  return (
    <section className="py-16 bg-primary text-primary-foreground">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <h2 className="text-2xl md:text-3xl font-bold mb-6">
          {ctaFinal.title}
        </h2>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Button 
            asChild 
            size="lg" 
            variant="outline"
            className="text-lg h-14 px-10 bg-primary-foreground/10 hover:bg-primary-foreground/20 border-primary-foreground/20 text-primary-foreground"
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
            className="text-lg h-14 px-10 border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10"
          >
            <a href="#mini-diagnostico">
              <Calendar className="mr-2 h-5 w-5" />
              {ctaFinal.ctaSecondary || "Agendar diagnóstico de 15 min"}
            </a>
          </Button>
        </div>
        <p className="text-sm opacity-70 mt-4">{ctaFinal.subtitle}</p>
      </div>
    </section>
  );
}
