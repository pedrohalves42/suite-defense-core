import { useState } from "react";
import { Link } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useLandingContent } from "@/hooks/useLandingContent";

interface TierResult {
  price: number;
  plan: string;
  baseDevices: number;
  maxDevices: number;
  basePrice: number;
  extraDevices: number;
  extraPrice: number;
  pricePerExtra: number;
  isEnterprise: boolean;
}

function calculateTier(devices: number): TierResult {
  if (devices <= 0 || Number.isNaN(devices)) {
    return { price: 0, plan: 'Free', baseDevices: 3, maxDevices: 3, basePrice: 0, extraDevices: 0, extraPrice: 0, pricePerExtra: 0, isEnterprise: false };
  }
  if (devices <= 3) {
    return { price: 0, plan: 'Free', baseDevices: 3, maxDevices: 3, basePrice: 0, extraDevices: 0, extraPrice: 0, pricePerExtra: 0, isEnterprise: false };
  }
  if (devices <= 50) {
    const basePrice = 499;
    const baseDevices = 10;
    const pricePerExtra = 39;
    const extraDevices = Math.max(0, devices - baseDevices);
    const extraPrice = extraDevices * pricePerExtra;
    return { price: basePrice + extraPrice, plan: 'Starter Compliance', baseDevices, maxDevices: 50, basePrice, extraDevices, extraPrice, pricePerExtra, isEnterprise: false };
  }
  if (devices <= 200) {
    const basePrice = 899;
    const baseDevices = 20;
    const pricePerExtra = 24;
    const extraDevices = Math.max(0, devices - baseDevices);
    const extraPrice = extraDevices * pricePerExtra;
    return { price: basePrice + extraPrice, plan: 'Business', baseDevices, maxDevices: 200, basePrice, extraDevices, extraPrice, pricePerExtra, isEnterprise: false };
  }
  return { price: 0, plan: 'Enterprise', baseDevices: 200, maxDevices: Infinity, basePrice: 0, extraDevices: 0, extraPrice: 0, pricePerExtra: 0, isEnterprise: true };
}

export function CalculatorSection() {
  const { calculator } = useLandingContent();
  const [deviceCount, setDeviceCount] = useState<number>(10);
  const tierResult = calculateTier(deviceCount);

  return (
    <section className="py-20 bg-muted/30">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-2xl md:text-3xl font-bold mb-4 text-center">
          {calculator.title}
        </h2>
        <p className="text-center text-muted-foreground mb-8">
          {calculator.label}
        </p>
        
        <div className="flex flex-col items-center gap-6 justify-center">
          <Input 
            type="number" 
            min={1} 
            max={500} 
            value={deviceCount} 
            onChange={e => setDeviceCount(Math.max(1, Math.min(500, Number(e.target.value) || 1)))} 
            className="max-w-xs text-center text-lg input-enterprise" 
            aria-label={calculator.label} 
          />
          
          <Card className="w-full max-w-md card-enterprise">
            <CardContent className="pt-6 text-center">
              {tierResult.isEnterprise ? (
                <>
                  <div className="text-xs section-label-enterprise mb-2">Plano Recomendado</div>
                  <div className="text-xl font-bold text-foreground mb-2">Enterprise</div>
                  <p className="text-sm text-muted-foreground mb-4">
                    Para {deviceCount}+ dispositivos, entre em contato para um plano personalizado.
                  </p>
                  <Button asChild className="w-full btn-enterprise">
                    <Link to="/pricing">Ver Planos Enterprise</Link>
                  </Button>
                </>
              ) : (
                <>
                  <div className="text-xs section-label-enterprise mb-2">Plano Recomendado</div>
                  <div className="text-xl font-bold text-foreground mb-1">{tierResult.plan}</div>
                  <div className="text-2xl font-bold text-foreground mb-2">
                    {tierResult.price === 0 ? 'Grátis' : `R$ ${tierResult.price}/mês`}
                  </div>
                  <p className="text-sm text-muted-foreground mb-4">
                    Inclui até {tierResult.maxDevices} dispositivos
                  </p>
                  <Button asChild className="w-full btn-enterprise">
                    <Link to="/pricing">Ver Detalhes do Plano</Link>
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}

