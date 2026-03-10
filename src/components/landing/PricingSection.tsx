import { Zap, Crown, CheckCircle, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { useLandingContent } from "@/hooks/useLandingContent";
import { SectionHeader } from "./shared/SectionHeader";
import { CONTACT } from "@/constants/config";
import { motion } from "framer-motion";

export function PricingSection() {
  const { pricing } = useLandingContent();
  const whatsappLink = `${CONTACT.WHATSAPP_LINK}?text=${CONTACT.WHATSAPP_TEXT_DEFAULT}`;

  const planIcons = {
    starter: Zap,
    business: Crown,
    enterprise: Shield
  };

  return (
    <section id="precos" className="py-24 relative">
      <div className="absolute inset-0 bg-gradient-to-b from-background via-muted/20 to-background" />
      
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeader 
          badge={{ icon: Shield, text: pricing.badge }}
          title={pricing.title}
          subtitle={pricing.subtitle}
        />

        <div className="grid md:grid-cols-3 gap-6 max-w-6xl mx-auto items-stretch">
          {pricing.plans.map((plan, index) => {
            const Icon = planIcons[plan.id as keyof typeof planIcons];
            
            if (plan.highlighted) {
              return (
                <motion.div 
                  key={plan.id}
                  className="relative p-8 rounded-2xl bg-primary text-primary-foreground border-2 border-accent/40 shadow-float scale-[1.03] z-10"
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.15 }}
                >
                  {plan.badge && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-accent text-accent-foreground px-5 py-1.5 rounded-full text-xs font-bold shadow-lg">
                      {plan.badge}
                    </div>
                  )}
                  <div className="flex items-center gap-3 mb-6">
                    <div className="p-2.5 bg-accent/20 rounded-xl">
                      <Icon className="w-6 h-6 text-accent" />
                    </div>
                    <h3 className="text-xl font-bold">{plan.name}</h3>
                  </div>
                  <div className="mb-2">
                    <span className="text-4xl font-bold">R$ {plan.price}</span>
                    <span className="opacity-70 text-sm ml-1">{plan.period}</span>
                  </div>
                  <p className="text-xs opacity-60 mb-6">
                    Base: {plan.baseDevices} dispositivos • +R$ {plan.pricePerExtra}/adicional<br />
                    <span className="font-medium opacity-80">Até {plan.maxDevices} dispositivos</span>
                  </p>
                  <p className="text-sm opacity-75 mb-8">{plan.description}</p>
                  <ul className="space-y-3 mb-8">
                    {plan.features.map((feature, i) => (
                      <li key={i} className="flex items-start gap-3">
                        <CheckCircle className="w-4 h-4 shrink-0 mt-0.5 text-accent" />
                        <span className="text-sm">{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <Button className="w-full h-12 bg-accent hover:bg-accent/90 text-accent-foreground font-semibold" asChild>
                    <Link to="/signup">{plan.cta}</Link>
                  </Button>
                </motion.div>
              );
            }

            return (
              <motion.div 
                key={plan.id}
                className="p-8 rounded-2xl bg-card border border-border hover:border-accent/20 transition-all duration-300"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
              >
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2.5 bg-accent/10 rounded-xl">
                    <Icon className="w-6 h-6 text-accent" />
                  </div>
                  <h3 className="text-xl font-bold text-foreground">{plan.name}</h3>
                </div>
                <div className="mb-2">
                  {plan.price ? (
                    <>
                      <span className="text-4xl font-bold text-foreground">R$ {plan.price}</span>
                      <span className="text-muted-foreground text-sm ml-1">{plan.period}</span>
                    </>
                  ) : (
                    <span className="text-4xl font-bold text-foreground">{plan.priceLabel}</span>
                  )}
                </div>
                {plan.baseDevices && (
                  <p className="text-xs text-muted-foreground mb-6">
                    Base: {plan.baseDevices} dispositivos • +R$ {plan.pricePerExtra}/adicional<br />
                    <span className="font-medium text-accent">Até {plan.maxDevices} dispositivos</span>
                  </p>
                )}
                <p className="text-sm text-muted-foreground mb-8">{plan.description}</p>
                <ul className="space-y-3 mb-8">
                  {plan.features.map((feature, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <CheckCircle className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                      <span className="text-sm text-foreground">{feature}</span>
                    </li>
                  ))}
                </ul>
                <Button variant="outline" className="w-full h-12" asChild>
                  {plan.isEnterprise ? (
                    <a href={whatsappLink} target="_blank" rel="noopener noreferrer">{plan.cta}</a>
                  ) : (
                    <Link to="/signup">{plan.cta}</Link>
                  )}
                </Button>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
