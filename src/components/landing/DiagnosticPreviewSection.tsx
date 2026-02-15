import { CheckCircle } from "lucide-react";
import { LANDING_CONTENT } from "@/constants/landing-content";
import { SectionHeader } from "./shared/SectionHeader";

export function DiagnosticPreviewSection() {
  const { diagnostic } = LANDING_CONTENT;

  return (
    <section className="py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeader 
          title={diagnostic.title}
          subtitle={diagnostic.subtitle}
        />

        <div className="grid md:grid-cols-2 lg:grid-cols-5 gap-4 max-w-5xl mx-auto">
          {diagnostic.items.map((item, index) => (
            <div 
              key={index}
              className="card-enterprise p-5 rounded-xl text-center"
            >
              <CheckCircle className="w-6 h-6 text-accent mx-auto mb-3" />
              <h3 className="font-semibold text-sm mb-1">{item.title}</h3>
              <p className="text-xs text-muted-foreground">{item.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
