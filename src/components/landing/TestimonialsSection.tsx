import { useLandingContent } from "@/hooks/useLandingContent";
import { SectionHeader } from "./shared/SectionHeader";
import { motion } from "framer-motion";
import { Quote } from "lucide-react";

export function TestimonialsSection() {
  const { testimonials } = useLandingContent();

  return (
    <section id="depoimentos" className="py-24 relative">
      <div className="absolute inset-0 bg-gradient-to-b from-muted/40 to-background" />
      
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeader 
          title={testimonials.title}
          subtitle={testimonials.subtitle}
        />

        <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {testimonials.items.map((testimonial, index) => (
            <motion.div
              key={index}
              className="relative p-8 rounded-2xl bg-card border border-border hover:border-accent/20 transition-all duration-300 group"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.15 }}
            >
              <Quote className="w-8 h-8 text-accent/20 mb-4" />
              
              <p className="text-sm text-muted-foreground leading-relaxed mb-8">
                "{testimonial.quote}"
              </p>
              
              <div className="flex items-center gap-4 mt-auto">
                <div className="w-12 h-12 bg-accent/10 rounded-full flex items-center justify-center ring-2 ring-accent/20">
                  <span className="font-bold text-sm text-accent">{testimonial.initials}</span>
                </div>
                <div>
                  <p className="font-semibold text-sm text-foreground">{testimonial.name}</p>
                  <p className="text-xs text-muted-foreground">{testimonial.role}</p>
                  <p className="text-xs text-accent font-medium">{testimonial.devices}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
