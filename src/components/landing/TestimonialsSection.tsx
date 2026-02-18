import { Card, CardContent } from "@/components/ui/card";
import { useLandingContent } from "@/hooks/useLandingContent";
import { SectionHeader } from "./shared/SectionHeader";

export function TestimonialsSection() {
  const { testimonials } = useLandingContent();

  return (
    <section className="py-20 bg-muted/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeader 
          title={testimonials.title}
          subtitle={testimonials.subtitle}
          titleClassName="text-3xl md:text-4xl"
        />

        <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {testimonials.items.map((testimonial, index) => (
            <Card 
              key={index}
              className="card-enterprise card-enterprise-hover"
            >
              <CardContent className="pt-6">
                <div className="mb-4 text-accent/40 text-4xl font-serif leading-none">"</div>
                <p className="mb-6 text-sm text-muted-foreground leading-relaxed">
                  "{testimonial.quote}"
                </p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-accent/10 rounded-full flex items-center justify-center">
                    <span className="font-semibold text-sm text-accent">{testimonial.initials}</span>
                  </div>
                  <div>
                    <p className="font-semibold text-sm">{testimonial.name}</p>
                    <p className="text-xs text-muted-foreground">{testimonial.role}</p>
                    <p className="text-xs text-accent">{testimonial.devices}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
