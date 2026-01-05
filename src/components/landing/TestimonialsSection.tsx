import { Card, CardContent } from "@/components/ui/card";
import { LANDING_CONTENT } from "@/constants/landing-content";
import { SectionHeader } from "./shared/SectionHeader";

export function TestimonialsSection() {
  const { testimonials } = LANDING_CONTENT;

  return (
    <section className="py-20 bg-muted/30 relative overflow-hidden">
      <div className="absolute top-20 right-10 w-96 h-96 bg-primary/10 rounded-full blur-3xl opacity-50" />
      <div className="absolute bottom-20 left-10 w-96 h-96 bg-accent/10 rounded-full blur-3xl opacity-50" />
      
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeader 
          title={testimonials.title}
          subtitle={testimonials.subtitle}
          titleClassName="text-3xl md:text-4xl"
        />

        <div className="grid md:grid-cols-3 gap-12 max-w-6xl mx-auto">
          {testimonials.items.map((testimonial, index) => (
            <Card 
              key={index}
              className="group relative bg-card/50 backdrop-blur-xl border-primary/20 transition-all duration-300 hover:scale-105 hover:shadow-glow-primary hover:border-primary/50"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent rounded-lg opacity-0 group-hover:opacity-100 transition-opacity" />
              <CardContent className="relative pt-6">
                <div className="mb-4 text-primary/30 text-5xl font-serif leading-none">"</div>
                <p className="mb-6 text-muted-foreground leading-relaxed">
                  "{testimonial.quote}"
                </p>
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-primary/20 to-accent/20 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                    <span className="font-bold text-primary">{testimonial.initials}</span>
                  </div>
                  <div>
                    <p className="font-bold">{testimonial.name}</p>
                    <p className="text-sm text-muted-foreground">{testimonial.role}</p>
                    <p className="text-xs text-primary">{testimonial.devices}</p>
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
