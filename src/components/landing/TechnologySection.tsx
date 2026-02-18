import { Server } from "lucide-react";
import { useLandingContent } from "@/hooks/useLandingContent";
import { SectionHeader } from "./shared/SectionHeader";
import { FeatureCard } from "./shared/FeatureCard";

export function TechnologySection() {
  const { technology } = useLandingContent();

  return (
    <section className="py-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeader 
          badge={{ icon: Server, text: technology.badge }}
          title={technology.title}
          subtitle={technology.subtitle}
        />

        {/* Features Grid */}
        <div className="grid md:grid-cols-4 gap-4 max-w-5xl mx-auto">
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
          <div className="card-enterprise rounded-xl overflow-hidden">
            <div className="grid grid-cols-3 gap-4 p-4 bg-muted/50 border-b border-border font-semibold text-sm">
              <div>Recurso</div>
              <div className="text-center text-accent">CyberShield</div>
              <div className="text-center text-muted-foreground">Concorrentes</div>
            </div>
            <div className="divide-y divide-border">
              {technology.comparison.map((row, index) => (
                <div key={index} className="grid grid-cols-3 gap-4 p-4 text-sm">
                  <div>{row.feature}</div>
                  <div className="text-center text-accent font-semibold">
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
