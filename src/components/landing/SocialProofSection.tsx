import { useLandingContent } from "@/hooks/useLandingContent";

export function SocialProofSection() {
  const { socialProof } = useLandingContent();

  return (
    <section className="py-12 border-y border-border bg-card">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-wrap justify-center items-center gap-8 md:gap-16">
          {socialProof.stats.map((stat, index) => (
            <div key={index} className="text-center">
              <div className="text-2xl md:text-3xl font-bold text-foreground">
                {stat.value}
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                {stat.label}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
