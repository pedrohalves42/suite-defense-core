import { useLandingContent } from "@/hooks/useLandingContent";
import { SectionHeader } from "./shared/SectionHeader";

export function BenefitsSection() {
  const { benefits } = useLandingContent();

  return (
    <section id="recursos" className="py-20 bg-muted/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeader 
          title={benefits.title}
          subtitle={benefits.subtitle}
        />

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
          {benefits.cards.map((card, index) => {
            const Icon = card.icon;
            return (
              <div 
                key={index}
                className="card-enterprise card-enterprise-hover p-6 rounded-xl text-center"
              >
                <div className="w-12 h-12 bg-accent/10 rounded-lg flex items-center justify-center mb-4 mx-auto">
                  <Icon className="w-6 h-6 text-accent" />
                </div>
                <h3 className="text-base font-semibold mb-2">{card.title}</h3>
                <p className="text-sm text-muted-foreground">{card.description}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
