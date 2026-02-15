import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { LANDING_CONTENT } from "@/constants/landing-content";

export function CTASection() {
  const { ctaFinal } = LANDING_CONTENT;

  return (
    <section className="py-16 bg-primary text-primary-foreground">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <h2 className="text-2xl md:text-3xl font-bold mb-6">
          {ctaFinal.title}
        </h2>
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
        <p className="text-sm opacity-70 mt-4">{ctaFinal.subtitle}</p>
      </div>
    </section>
  );
}
