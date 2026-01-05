import { Zap, Crown, CheckCircle, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { LANDING_CONTENT } from "@/constants/landing-content";
import { SectionHeader } from "./shared/SectionHeader";
import { CONTACT } from "@/constants/config";

export function PricingSection() {
  const { pricing } = LANDING_CONTENT;
  const whatsappLink = `${CONTACT.WHATSAPP_LINK}?text=${CONTACT.WHATSAPP_TEXT_DEFAULT}`;

  const planIcons = {
    starter: Zap,
    business: Crown,
    enterprise: Shield
  };

  return (
    <section id="precos" className="py-20 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-background to-muted/30" />
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeader 
          badge={{ icon: Shield, text: pricing.badge }}
          title={pricing.title}
          subtitle={pricing.subtitle}
        />

        <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {pricing.plans.map((plan) => {
            const Icon = planIcons[plan.id as keyof typeof planIcons];
            
            if (plan.highlighted) {
              return (
                <div 
                  key={plan.id}
                  className="relative p-8 rounded-2xl scale-105 shadow-2xl backdrop-blur-xl border-2 transition-all duration-300 hover:scale-110 bg-gradient-to-br from-primary via-primary/90 to-accent text-primary-foreground border-primary"
                >
                  {plan.badge && (
                    <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-accent text-accent-foreground px-4 py-1.5 rounded-full text-sm font-bold shadow-lg">
                      {plan.badge}
                    </div>
                  )}
                  <div className="flex items-center gap-2 mb-4">
                    <div className="p-2 bg-white/20 rounded-lg">
                      <Icon className="w-6 h-6" />
                    </div>
                    <h3 className="text-2xl font-bold">{plan.name}</h3>
                  </div>
                  <div className="mb-2">
                    <span className="text-3xl font-bold">R$ {plan.price}</span>
                    <span className="opacity-90">{plan.period}</span>
                  </div>
                  <p className="text-xs opacity-80 mb-4">
                    Base: {plan.baseDevices} dispositivos • +R$ {plan.pricePerExtra}/dispositivo adicional<br />
                    <span className="font-medium">Até {plan.maxDevices} dispositivos</span>
                  </p>
                  <p className="text-sm opacity-90 mb-6">{plan.description}</p>
                  <ul className="space-y-3 mb-8">
                    {plan.features.map((feature, index) => (
                      <li key={index} className="flex items-start gap-2">
                        <CheckCircle className="w-5 h-5 shrink-0 mt-0.5" />
                        <span className={`text-sm ${index > 0 ? 'font-semibold' : ''}`}>{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <Button variant="outline" className="w-full bg-white/20 hover:bg-white/30 border-white/30" asChild>
                    <Link to="/signup">{plan.cta}</Link>
                  </Button>
                </div>
              );
            }

            return (
              <div 
                key={plan.id}
                className="group relative p-8 rounded-2xl border-2 border-border hover:border-primary/50 transition-all duration-300 bg-card/50 backdrop-blur-sm hover:scale-105 hover:shadow-lg"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="relative flex items-center gap-2 mb-4">
                  <div className="p-2 bg-primary/10 rounded-lg group-hover:scale-110 transition-transform">
                    <Icon className="w-6 h-6 text-primary" />
                  </div>
                  <h3 className="text-2xl font-bold">{plan.name}</h3>
                </div>
                <div className="relative mb-2">
                  {plan.price ? (
                    <>
                      <span className="text-3xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                        R$ {plan.price}
                      </span>
                      <span className="text-muted-foreground">{plan.period}</span>
                    </>
                  ) : (
                    <span className="text-3xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                      {plan.priceLabel}
                    </span>
                  )}
                </div>
                {plan.baseDevices && (
                  <p className="relative text-xs text-muted-foreground mb-4">
                    Base: {plan.baseDevices} dispositivos • +R$ {plan.pricePerExtra}/dispositivo adicional<br />
                    <span className="font-medium text-primary">Até {plan.maxDevices} dispositivos</span>
                  </p>
                )}
                <p className="relative text-sm text-muted-foreground mb-6">{plan.description}</p>
                <ul className="relative space-y-3 mb-8">
                  {plan.features.map((feature, index) => (
                    <li key={index} className="flex items-start gap-2">
                      <CheckCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                      <span className={`text-sm ${index > 0 && !plan.isEnterprise ? 'font-semibold' : ''}`}>
                        {feature}
                      </span>
                    </li>
                  ))}
                </ul>
                <Button 
                  variant="outline" 
                  className="relative w-full group-hover:bg-primary/10 transition-colors" 
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
