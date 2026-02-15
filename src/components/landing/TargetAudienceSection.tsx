import { LANDING_CONTENT } from "@/constants/landing-content";
import { FeatureCard } from "./shared/FeatureCard";
import { SectionHeader } from "./shared/SectionHeader";

export function TargetAudienceSection() {
  const { targetAudience } = LANDING_CONTENT;

  return (
    <section className="py-16 bg-muted/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeader 
          title={targetAudience.title}
          subtitle={targetAudience.subtitle}
        />

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 max-w-5xl mx-auto">
          {targetAudience.segments.map((segment, index) => (
            <FeatureCard
              key={index}
              icon={segment.icon}
              title={segment.title}
              description={segment.description}
              variant="highlight"
              centered
              className="p-5"
            />
          ))}
        </div>
      </div>
    </section>
  );
}
