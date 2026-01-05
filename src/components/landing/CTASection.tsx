import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { LANDING_CONTENT } from "@/constants/landing-content";

export function CTASection() {
  const { ctaFinal } = LANDING_CONTENT;

  return (
    <section className="py-16 bg-gradient-to-r from-primary/10 to-accent/10 border-y border-primary/20">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <h2 className="text-2xl md:text-3xl font-bold mb-6">
          {ctaFinal.title}
        </h2>
        <Button 
          asChild 
          size="lg" 
          className="text-lg h-14 px-10 bg-gradient-to-r from-primary to-accent hover:shadow-glow-primary transition-all hover:scale-105"
        >
          <Link to="/signup">
            {ctaFinal.cta}
            <ArrowRight className="ml-2 h-5 w-5" />
          </Link>
        </Button>
        <p className="text-sm text-muted-foreground mt-4">{ctaFinal.subtitle}</p>
      </div>
    </section>
  );
}
