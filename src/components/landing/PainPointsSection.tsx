import { AlertTriangle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { LANDING_CONTENT } from "@/constants/landing-content";
import { SectionHeader } from "./shared/SectionHeader";
import { FeatureCard } from "./shared/FeatureCard";

export function PainPointsSection() {
  const { painPoints } = LANDING_CONTENT;

  return (
    <section className="py-16 border-y border-destructive/10 bg-destructive/[0.02]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Impactful Questions */}
        <div className="text-center mb-12 animate-fade-in">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-destructive/10 border border-destructive/20 mb-6">
            <AlertTriangle className="w-4 h-4 text-destructive" />
            <span className="text-sm font-medium text-destructive">{painPoints.badge}</span>
          </div>
          
          <div className="space-y-3 mb-8">
            {painPoints.questions.map((question, index) => (
              <p key={index} className="text-lg md:text-xl font-semibold text-foreground">
                {question}
              </p>
            ))}
          </div>

          <h2 className="text-xl md:text-2xl font-bold text-destructive">
            {painPoints.conclusion}
          </h2>
        </div>

        {/* Stats */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 max-w-6xl mx-auto">
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
            className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
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
