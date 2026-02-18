import { useLandingContent } from "@/hooks/useLandingContent";
import { SectionHeader } from "./shared/SectionHeader";

export function UseCasesSection() {
  const { useCases } = useLandingContent();

  return (
    <section className="py-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeader 
          title={useCases.title}
          subtitle={useCases.subtitle}
        />

        <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {useCases.cases.map((useCase, index) => {
            const Icon = useCase.icon;
            return (
              <div 
                key={index}
                className="card-enterprise card-enterprise-hover p-8 rounded-xl text-center"
              >
                <div className="w-12 h-12 bg-accent/10 rounded-lg flex items-center justify-center mx-auto mb-4">
                  <Icon className="w-6 h-6 text-accent" />
                </div>
                <h3 className="text-base font-semibold mb-2">{useCase.title}</h3>
                <p className="text-sm text-muted-foreground">{useCase.description}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
