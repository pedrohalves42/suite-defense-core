import { LANDING_CONTENT } from "@/constants/landing-content";
import { SectionHeader } from "./shared/SectionHeader";

export function UseCasesSection() {
  const { useCases } = LANDING_CONTENT;

  return (
    <section className="py-20 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeader 
          title={useCases.title}
          subtitle={useCases.subtitle}
        />

        <div className="grid md:grid-cols-3 gap-12 max-w-5xl mx-auto">
          {useCases.cases.map((useCase, index) => {
            const Icon = useCase.icon;
            return (
              <div 
                key={index}
                className="group relative bg-card/50 backdrop-blur-sm p-8 rounded-2xl border border-border text-center transition-all duration-300 hover:-translate-y-2 hover:shadow-lg hover:border-primary/50"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="relative mb-4 inline-block">
                  <div className="absolute inset-0 bg-primary/20 rounded-full blur-xl opacity-0 group-hover:opacity-100 transition-opacity" />
                  <Icon className="relative mx-auto w-12 h-12 text-primary group-hover:scale-110 transition-transform" />
                </div>
                <h3 className="relative text-xl font-bold mb-2">{useCase.title}</h3>
                <p className="relative text-muted-foreground">{useCase.description}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
