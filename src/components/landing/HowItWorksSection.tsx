import { LANDING_CONTENT } from "@/constants/landing-content";
import { SectionHeader } from "./shared/SectionHeader";

export function HowItWorksSection() {
  const { howItWorks } = LANDING_CONTENT;

  return (
    <section className="py-20 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-background to-muted/30" />
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeader 
          title={howItWorks.title}
          subtitle={howItWorks.subtitle}
        />

        <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
          {howItWorks.steps.map((step) => (
            <div key={step.number} className="relative text-center p-6">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-12 h-12 bg-gradient-to-br from-primary to-accent rounded-full flex items-center justify-center text-primary-foreground font-bold text-xl shadow-lg">
                {step.number}
              </div>
              <div className="pt-16">
                <h3 className="text-xl font-bold mb-3">{step.title}</h3>
                <p className="text-muted-foreground">{step.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
