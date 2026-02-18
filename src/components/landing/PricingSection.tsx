import { Zap, Crown, CheckCircle, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { useLandingContent } from "@/hooks/useLandingContent";
import { SectionHeader } from "./shared/SectionHeader";
import { CONTACT } from "@/constants/config";

export function PricingSection() {
  const { pricing } = useLandingContent();
  const whatsappLink = `${CONTACT.WHATSAPP_LINK}?text=${CONTACT.WHATSAPP_TEXT_DEFAULT}`;

  const planIcons = {
    starter: Zap,
    business: Crown,
    enterprise: Shield
  };

  return (
    <section id="precos" className="py-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeader 
          badge={{ icon: Shield, text: pricing.badge }}
          title={pricing.title}
          subtitle={pricing.subtitle}
        />

        <div className="grid md:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {pricing.plans.map((plan) => {
            const Icon = planIcons[plan.id as keyof typeof planIcons];
            
            if (plan.highlighted) {
              return (
                <div 
                  key={plan.id}
                  className="relative p-8 rounded-xl bg-primary text-primary-foreground border-2 border-primary shadow-elevated scale-[1.02]"
                >
                  {plan.badge && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-accent text-accent-foreground px-4 py-1 rounded-full text-xs font-bold">
                      {plan.badge}
                    </div>
                  )}
                  <div className="flex items-center gap-2 mb-4">
                    <div className="p-2 bg-primary-foreground/10 rounded-lg">
                      <Icon className="w-5 h-5" />
                    </div>
                    <h3 className="text-xl font-bold">{plan.name}</h3>
                  </div>
                  <div className="mb-2">
                    <span className="text-3xl font-bold">R$ {plan.price}</span>
                    <span className="opacity-80 text-sm">{plan.period}</span>
                  </div>
                  <p className="text-xs opacity-70 mb-4">
                    Base: {plan.baseDevices} dispositivos • +R$ {plan.pricePerExtra}/adicional<br />
                    <span className="font-medium">Até {plan.maxDevices} dispositivos</span>
                  </p>
                  <p className="text-sm opacity-80 mb-6">{plan.description}</p>
                  <ul className="space-y-2.5 mb-8">
                    {plan.features.map((feature, index) => (
                      <li key={index} className="flex items-start gap-2">
                        <CheckCircle className="w-4 h-4 shrink-0 mt-0.5 opacity-80" />
                        <span className="text-sm">{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <Button variant="outline" className="w-full bg-primary-foreground/10 hover:bg-primary-foreground/20 border-primary-foreground/20" asChild>
                    <Link to="/signup">{plan.cta}</Link>
                  </Button>
                </div>
              );
            }

            return (
              <div 
                key={plan.id}
                className="card-enterprise card-enterprise-hover p-8 rounded-xl"
              >
                <div className="flex items-center gap-2 mb-4">
                  <div className="p-2 bg-accent/10 rounded-lg">
                    <Icon className="w-5 h-5 text-accent" />
                  </div>
                  <h3 className="text-xl font-bold">{plan.name}</h3>
                </div>
                <div className="mb-2">
                  {plan.price ? (
                    <>
                      <span className="text-3xl font-bold text-foreground">
                        R$ {plan.price}
                      </span>
                      <span className="text-muted-foreground text-sm">{plan.period}</span>
                    </>
                  ) : (
                    <span className="text-3xl font-bold text-foreground">
                      {plan.priceLabel}
                    </span>
                  )}
                </div>
                {plan.baseDevices && (
                  <p className="text-xs text-muted-foreground mb-4">
                    Base: {plan.baseDevices} dispositivos • +R$ {plan.pricePerExtra}/adicional<br />
                    <span className="font-medium text-accent">Até {plan.maxDevices} dispositivos</span>
                  </p>
                )}
                <p className="text-sm text-muted-foreground mb-6">{plan.description}</p>
                <ul className="space-y-2.5 mb-8">
                  {plan.features.map((feature, index) => (
                    <li key={index} className="flex items-start gap-2">
                      <CheckCircle className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                      <span className="text-sm">{feature}</span>
                    </li>
                  ))}
                </ul>
                <Button 
                  variant="outline" 
                  className="w-full" 
                  asChild
                >
                  {plan.isEnterprise ? (
                    <a href={whatsappLink} target="_blank" rel="noopener noreferrer">
                      {plan.cta}
                    </a>
                  ) : (
                    <Link to="/signup">{plan.cta}</Link>
                  )}
                </Button>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
