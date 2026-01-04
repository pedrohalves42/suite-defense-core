import { Check, Monitor, MapPin } from 'lucide-react';

interface TrustIndicatorsProps {
  deviceRecognized?: boolean;
  locationConsistent?: boolean;
}

export function TrustIndicators({ 
  deviceRecognized = true, 
  locationConsistent = true 
}: TrustIndicatorsProps) {
  return (
    <div className="flex items-center gap-4 text-[11px] text-muted-foreground/60 bg-muted/20 p-3 rounded-lg border border-border/20">
      {deviceRecognized && (
        <span className="flex items-center gap-1.5">
          <Check className="h-3 w-3 text-green-500/70" />
          <Monitor className="h-3 w-3" />
          Dispositivo reconhecido
        </span>
      )}
      {locationConsistent && (
        <span className="flex items-center gap-1.5">
          <Check className="h-3 w-3 text-green-500/70" />
          <MapPin className="h-3 w-3" />
          Localização consistente
        </span>
      )}
    </div>
  );
}
