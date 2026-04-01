import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Building2, MapPin, Clock, ChevronRight, ChevronLeft, Check, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTenantSetupWizard } from './useTenantSetupWizard';
import { DAYS_OF_WEEK, TIMEZONES, BRAZILIAN_STATES } from './constants';

const STEP_ICONS = [Building2, MapPin, Clock] as const;

interface TenantSetupWizardProps {
  open: boolean;
}

export const TenantSetupWizard = ({ open }: TenantSetupWizardProps) => {
  const {
    currentStep, steps, isSaving,
    companyData, setCompanyData,
    addressData, setAddressData,
    businessHours, setBusinessHours,
    validateStep, handleNext, handlePrevious, handleComplete,
    toggleDay, formatCNPJ, formatPhone, formatCEP,
  } = useTenantSetupWizard();

  return (
    <Dialog open={open} modal>
      <DialogContent
        className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="text-xl">Configuração Inicial</DialogTitle>
          <DialogDescription>Complete as informações da sua empresa para começar a usar o sistema.</DialogDescription>
        </DialogHeader>

        {/* Progress Steps */}
        <div className="flex items-center justify-between mb-6">
          {steps.map((step, index) => {
            const Icon = STEP_ICONS[index];
            const isActive = index === currentStep;
            const isCompleted = index < currentStep;
            return (
              <div key={index} className="flex flex-col items-center flex-1">
                <div className="flex items-center w-full">
                  <div className={cn(
                    "flex items-center justify-center w-10 h-10 rounded-full border-2 transition-colors",
                    (isActive || isCompleted) && "border-primary bg-primary text-primary-foreground",
                    !isActive && !isCompleted && "border-muted-foreground/30 text-muted-foreground"
                  )}>
                    {isCompleted ? <Check className="w-5 h-5" /> : <Icon className="w-5 h-5" />}
                  </div>
                  {index < steps.length - 1 && (
                    <div className={cn("flex-1 h-0.5 mx-2", isCompleted ? "bg-primary" : "bg-muted-foreground/30")} />
                  )}
                </div>
                <span className={cn("text-xs mt-2 text-center", isActive ? "text-foreground font-medium" : "text-muted-foreground")}>{step.title}</span>
              </div>
            );
          })}
        </div>

        {/* Step Content */}
        <div className="space-y-4 min-h-[280px]">
          {currentStep === 0 && (
            <>
              <div className="space-y-2">
                <Label htmlFor="company_name">Nome da Empresa *</Label>
                <Input id="company_name" placeholder="Razão social ou nome fantasia" value={companyData.company_name} onChange={(e) => setCompanyData(prev => ({ ...prev, company_name: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cnpj">CNPJ</Label>
                <Input id="cnpj" placeholder="00.000.000/0000-00" value={companyData.cnpj} onChange={(e) => setCompanyData(prev => ({ ...prev, cnpj: formatCNPJ(e.target.value) }))} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="phone">Telefone</Label>
                  <Input id="phone" placeholder="(00) 00000-0000" value={companyData.phone} onChange={(e) => setCompanyData(prev => ({ ...prev, phone: formatPhone(e.target.value) }))} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contact_email">Email de Contato</Label>
                  <Input id="contact_email" type="email" placeholder="contato@empresa.com" value={companyData.contact_email} onChange={(e) => setCompanyData(prev => ({ ...prev, contact_email: e.target.value }))} />
                </div>
              </div>
            </>
          )}

          {currentStep === 1 && (
            <>
              <div className="space-y-2">
                <Label htmlFor="address">Endereço</Label>
                <Input id="address" placeholder="Rua, número, complemento" value={addressData.address} onChange={(e) => setAddressData(prev => ({ ...prev, address: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="city">Cidade</Label>
                  <Input id="city" placeholder="São Paulo" value={addressData.city} onChange={(e) => setAddressData(prev => ({ ...prev, city: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="state">Estado</Label>
                  <Select value={addressData.state} onValueChange={(value) => setAddressData(prev => ({ ...prev, state: value }))}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {BRAZILIAN_STATES.map((state) => (
                        <SelectItem key={state} value={state}>{state}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="zip_code">CEP</Label>
                <Input id="zip_code" placeholder="00000-000" value={addressData.zip_code} onChange={(e) => setAddressData(prev => ({ ...prev, zip_code: formatCEP(e.target.value) }))} className="max-w-[180px]" />
              </div>
            </>
          )}

          {currentStep === 2 && (
            <>
              <div className="flex items-center space-x-2 mb-4">
                <Checkbox id="business_hours_enabled" checked={businessHours.enabled} onCheckedChange={(checked) => setBusinessHours(prev => ({ ...prev, enabled: Boolean(checked) }))} />
                <Label htmlFor="business_hours_enabled" className="cursor-pointer">Habilitar verificação de horário de expediente</Label>
              </div>
              {businessHours.enabled && (
                <div className="p-4 bg-muted/50 rounded-lg border">
                  <p className="text-sm text-muted-foreground mb-4">O sistema não considerará PCs offline como falhas fora do horário de expediente configurado.</p>
                  <div className="space-y-4">
                    <div>
                      <Label className="mb-2 block">Dias da semana</Label>
                      <div className="flex flex-wrap gap-2">
                        {DAYS_OF_WEEK.map((day) => (
                          <Button key={day.value} type="button" variant={businessHours.days.includes(day.value) ? "default" : "outline"} size="sm" onClick={() => toggleDay(day.value)}>{day.label}</Button>
                        ))}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="start_time">Início do Expediente</Label>
                        <Input id="start_time" type="time" value={businessHours.start} onChange={(e) => setBusinessHours(prev => ({ ...prev, start: e.target.value }))} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="end_time">Fim do Expediente</Label>
                        <Input id="end_time" type="time" value={businessHours.end} onChange={(e) => setBusinessHours(prev => ({ ...prev, end: e.target.value }))} />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="timezone">Fuso Horário</Label>
                      <Select value={businessHours.timezone} onValueChange={(value) => setBusinessHours(prev => ({ ...prev, timezone: value }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {TIMEZONES.map((tz) => (
                            <SelectItem key={tz.value} value={tz.value}>{tz.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Navigation */}
        <div className="flex justify-between pt-4 border-t">
          <Button variant="outline" onClick={handlePrevious} disabled={currentStep === 0 || isSaving}>
            <ChevronLeft className="w-4 h-4 mr-2" />Anterior
          </Button>
          {currentStep < steps.length - 1 ? (
            <Button onClick={handleNext} disabled={!validateStep(currentStep)}>
              Próximo<ChevronRight className="w-4 h-4 ml-2" />
            </Button>
          ) : (
            <Button onClick={handleComplete} disabled={!validateStep(currentStep) || isSaving}>
              {isSaving ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" />Salvando...</>) : (<><Check className="w-4 h-4 mr-2" />Concluir</>)}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default TenantSetupWizard;
