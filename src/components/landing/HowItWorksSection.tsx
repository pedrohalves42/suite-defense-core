import { LANDING_CONTENT } from "@/constants/landing-content";
import { SectionHeader } from "./shared/SectionHeader";

export function HowItWorksSection() {
  const { howItWorks } = LANDING_CONTENT;

  return (
    <section className="py-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeader 
          title={howItWorks.title}
          subtitle={howItWorks.subtitle}
        />

        <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
          {howItWorks.steps.map((step) => (
            <div key={step.number} className="relative text-center p-6">
              <div className="w-10 h-10 bg-primary text-primary-foreground rounded-full flex items-center justify-center font-bold text-lg mx-auto mb-6">
                {step.number}
              </div>
              <h3 className="text-base font-semibold mb-2">{step.title}</h3>
              <p className="text-sm text-muted-foreground">{step.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
