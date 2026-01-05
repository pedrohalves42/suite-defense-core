import { LANDING_CONTENT } from "@/constants/landing-content";
import { SectionHeader } from "./shared/SectionHeader";

export function BenefitsSection() {
  const { benefits } = LANDING_CONTENT;

  return (
    <section id="recursos" className="py-20 bg-muted/30 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-background/50 to-transparent" />
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeader 
          title={benefits.title}
          subtitle={benefits.subtitle}
        />

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8 max-w-5xl mx-auto">
          {benefits.cards.map((card, index) => {
            const Icon = card.icon;
            return (
              <div 
                key={index}
                className="group relative bg-gradient-to-br from-card/80 to-card/40 backdrop-blur-xl p-8 rounded-2xl border border-primary/20 text-center transition-all duration-300 hover:scale-105 hover:shadow-glow-primary hover:border-primary/50"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="relative w-16 h-16 bg-gradient-to-br from-primary/20 to-accent/20 rounded-xl flex items-center justify-center mb-4 mx-auto group-hover:scale-110 transition-transform">
                  <Icon className="w-8 h-8 text-primary" />
                </div>
                <h3 className="relative text-xl font-bold mb-3">{card.title}</h3>
                <p className="relative text-muted-foreground">{card.description}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
