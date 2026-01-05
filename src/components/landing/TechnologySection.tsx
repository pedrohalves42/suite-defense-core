import { Server } from "lucide-react";
import { LANDING_CONTENT } from "@/constants/landing-content";
import { SectionHeader } from "./shared/SectionHeader";
import { FeatureCard } from "./shared/FeatureCard";

export function TechnologySection() {
  const { technology } = LANDING_CONTENT;

  return (
    <section className="py-20 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-background via-primary/5 to-background" />
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeader 
          badge={{ icon: Server, text: technology.badge }}
          title={technology.title}
          subtitle={technology.subtitle}
        />

        {/* Features Grid */}
        <div className="grid md:grid-cols-4 gap-6 max-w-5xl mx-auto">
          {technology.features.map((feature, index) => (
            <FeatureCard
              key={index}
              icon={feature.icon}
              title={feature.title}
              description={feature.description}
              variant="highlight"
              centered
            />
          ))}
        </div>

        {/* Comparison Table */}
        <div className="mt-12 max-w-3xl mx-auto">
          <div className="bg-card/50 backdrop-blur-sm rounded-2xl border border-border/50 overflow-hidden">
            <div className="grid grid-cols-3 gap-4 p-4 bg-muted/30 border-b border-border/50 font-semibold text-sm">
              <div>Recurso</div>
              <div className="text-center text-primary">CyberShield</div>
              <div className="text-center text-muted-foreground">Concorrentes</div>
            </div>
            <div className="divide-y divide-border/50">
              {technology.comparison.map((row, index) => (
                <div key={index} className="grid grid-cols-3 gap-4 p-4 text-sm">
                  <div>{row.feature}</div>
                  <div className="text-center text-primary font-bold">
                    {row.cybershield ? "✓" : "✗"}
                  </div>
                  <div className="text-center text-muted-foreground">
                    {row.competitors ? "✓" : "✗"}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
