import { AlertTriangle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { LANDING_CONTENT } from "@/constants/landing-content";
import { SectionHeader } from "./shared/SectionHeader";
import { FeatureCard } from "./shared/FeatureCard";

export function PainPointsSection() {
  const { painPoints } = LANDING_CONTENT;

  return (
    <section className="py-16 relative overflow-hidden bg-gradient-to-b from-destructive/5 to-background">
      <div className="absolute inset-0 bg-grid-white/[0.02]" />
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Impactful Questions */}
        <div className="text-center mb-12 animate-fade-in">
          <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-destructive/10 border border-destructive/30 backdrop-blur-sm mb-6">
            <AlertTriangle className="w-4 h-4 text-destructive animate-pulse" />
            <span className="text-sm font-medium text-destructive">{painPoints.badge}</span>
          </div>
          
          {/* Pain Questions */}
          <div className="space-y-4 mb-8">
            {painPoints.questions.map((question, index) => (
              <p key={index} className="text-lg md:text-xl font-bold text-foreground">
                {question}
              </p>
            ))}
          </div>

          <h2 className="text-2xl md:text-3xl font-bold mb-4 text-destructive">
            {painPoints.conclusion}
          </h2>
        </div>

        {/* Stats */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
          {painPoints.stats.map((stat, index) => (
            <FeatureCard
              key={index}
              emoji={stat.emoji}
              title={stat.title}
              description={stat.description}
              variant="danger"
            />
          ))}
        </div>

        {/* CTA */}
        <div className="text-center mt-10">
          <Button 
            asChild 
            size="lg" 
            className="bg-gradient-to-r from-destructive to-destructive/80 hover:shadow-lg transition-all hover:scale-105 text-destructive-foreground"
          >
            <Link to="/signup">
              {painPoints.cta}
              <ArrowRight className="ml-2 h-5 w-5" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
