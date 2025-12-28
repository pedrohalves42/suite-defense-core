import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Building2, MapPin, Clock, ChevronRight, ChevronLeft, Check, Loader2 } from 'lucide-react';
import { useTenantSetup, TenantSetupData, BusinessHoursData } from '@/hooks/useTenantSetup';
import { cn } from '@/lib/utils';

const DAYS_OF_WEEK = [
  { value: 'mon', label: 'Segunda' },
  { value: 'tue', label: 'Terça' },
  { value: 'wed', label: 'Quarta' },
  { value: 'thu', label: 'Quinta' },
  { value: 'fri', label: 'Sexta' },
  { value: 'sat', label: 'Sábado' },
  { value: 'sun', label: 'Domingo' },
];

const TIMEZONES = [
  { value: 'America/Sao_Paulo', label: 'Brasília (GMT-3)' },
  { value: 'America/Manaus', label: 'Manaus (GMT-4)' },
  { value: 'America/Cuiaba', label: 'Cuiabá (GMT-4)' },
  { value: 'America/Belem', label: 'Belém (GMT-3)' },
  { value: 'America/Fortaleza', label: 'Fortaleza (GMT-3)' },
  { value: 'America/Recife', label: 'Recife (GMT-3)' },
  { value: 'America/Bahia', label: 'Salvador (GMT-3)' },
  { value: 'America/Rio_Branco', label: 'Rio Branco (GMT-5)' },
];

const BRAZILIAN_STATES = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 
  'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 
  'SP', 'SE', 'TO'
];

interface TenantSetupWizardProps {
  open: boolean;
}

export const TenantSetupWizard = ({ open }: TenantSetupWizardProps) => {
  const { tenantData, saveSetup, isSaving } = useTenantSetup();
  const [currentStep, setCurrentStep] = useState(0);
  
  // Form state
  const [companyData, setCompanyData] = useState({
    company_name: '',
    cnpj: '',
    phone: '',
    contact_email: '',
  });
  
  const [addressData, setAddressData] = useState({
    address: '',
    city: '',
    state: '',
    zip_code: '',
  });
  
  const [businessHours, setBusinessHours] = useState<BusinessHoursData>({
    enabled: true,
    days: ['mon', 'tue', 'wed', 'thu', 'fri'],
    start: '08:00',
    end: '18:00',
    timezone: 'America/Sao_Paulo',
  });

  // Pre-fill form when data loads
  useState(() => {
    if (tenantData?.tenant) {
      const t = tenantData.tenant;
      setCompanyData({
        company_name: t.company_name || t.name || '',
        cnpj: t.cnpj || '',
        phone: t.phone || '',
        contact_email: t.contact_email || '',
      });
      setAddressData({
        address: t.address || '',
        city: t.city || '',
        state: t.state || '',
        zip_code: t.zip_code || '',
      });
    }
    if (tenantData?.businessHours) {
      setBusinessHours(tenantData.businessHours);
    }
  });

  const steps = [
    { title: 'Dados da Empresa', icon: Building2, description: 'Informações básicas' },
    { title: 'Endereço', icon: MapPin, description: 'Localização da empresa' },
    { title: 'Horário de Expediente', icon: Clock, description: 'Configurar monitoramento' },
  ];

  const validateStep = (step: number): boolean => {
    switch (step) {
      case 0:
        return companyData.company_name.trim().length > 0;
      case 1:
        return true; // Address is optional
      case 2:
        return !businessHours.enabled || (businessHours.days.length > 0 && !!businessHours.start && !!businessHours.end);
      default:
        return true;
    }
  };

  const handleNext = () => {
    if (currentStep < steps.length - 1 && validateStep(currentStep)) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleComplete = async () => {
    if (!validateStep(currentStep)) return;

    const data: TenantSetupData = {
      company: companyData,
      address: addressData,
      businessHours,
    };

    await saveSetup(data);
  };

  const toggleDay = (day: string) => {
    setBusinessHours(prev => ({
      ...prev,
      days: prev.days.includes(day)
        ? prev.days.filter(d => d !== day)
        : [...prev.days, day],
    }));
  };

  const formatCNPJ = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 14);
    return digits.replace(/^(\d{2})(\d{3})?(\d{3})?(\d{4})?(\d{2})?/, (_, a, b, c, d, e) => {
      let result = a;
      if (b) result += `.${b}`;
      if (c) result += `.${c}`;
      if (d) result += `/${d}`;
      if (e) result += `-${e}`;
      return result;
    });
  };

  const formatPhone = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 11);
    if (digits.length <= 10) {
      return digits.replace(/^(\d{2})(\d{4})?(\d{4})?/, (_, a, b, c) => {
        let result = `(${a}`;
        if (b) result += `) ${b}`;
        if (c) result += `-${c}`;
        return result;
      });
    }
    return digits.replace(/^(\d{2})(\d{5})?(\d{4})?/, (_, a, b, c) => {
      let result = `(${a}`;
      if (b) result += `) ${b}`;
      if (c) result += `-${c}`;
      return result;
    });
  };

  const formatCEP = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 8);
    return digits.replace(/^(\d{5})(\d{3})?/, (_, a, b) => b ? `${a}-${b}` : a);
  };

  return (
    <Dialog open={open} modal>
      <DialogContent 
        className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="text-xl">Configuração Inicial</DialogTitle>
          <DialogDescription>
            Complete as informações da sua empresa para começar a usar o sistema.
          </DialogDescription>
        </DialogHeader>

        {/* Progress Steps */}
        <div className="flex items-center justify-between mb-6">
          {steps.map((step, index) => {
            const Icon = step.icon;
            const isActive = index === currentStep;
            const isCompleted = index < currentStep;
            
            return (
              <div key={index} className="flex flex-col items-center flex-1">
                <div className="flex items-center w-full">
                  <div
                    className={cn(
                      "flex items-center justify-center w-10 h-10 rounded-full border-2 transition-colors",
                      isActive && "border-primary bg-primary text-primary-foreground",
                      isCompleted && "border-primary bg-primary text-primary-foreground",
                      !isActive && !isCompleted && "border-muted-foreground/30 text-muted-foreground"
                    )}
                  >
                    {isCompleted ? (
                      <Check className="w-5 h-5" />
                    ) : (
                      <Icon className="w-5 h-5" />
                    )}
                  </div>
                  {index < steps.length - 1 && (
                    <div
                      className={cn(
                        "flex-1 h-0.5 mx-2",
                        isCompleted ? "bg-primary" : "bg-muted-foreground/30"
                      )}
                    />
                  )}
                </div>
                <span className={cn(
                  "text-xs mt-2 text-center",
                  isActive ? "text-foreground font-medium" : "text-muted-foreground"
                )}>
                  {step.title}
                </span>
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
                <Input
                  id="company_name"
                  placeholder="Razão social ou nome fantasia"
                  value={companyData.company_name}
                  onChange={(e) => setCompanyData(prev => ({ ...prev, company_name: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cnpj">CNPJ</Label>
                <Input
                  id="cnpj"
                  placeholder="00.000.000/0000-00"
                  value={companyData.cnpj}
                  onChange={(e) => setCompanyData(prev => ({ ...prev, cnpj: formatCNPJ(e.target.value) }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="phone">Telefone</Label>
                  <Input
                    id="phone"
                    placeholder="(00) 00000-0000"
                    value={companyData.phone}
                    onChange={(e) => setCompanyData(prev => ({ ...prev, phone: formatPhone(e.target.value) }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contact_email">Email de Contato</Label>
                  <Input
                    id="contact_email"
                    type="email"
                    placeholder="contato@empresa.com"
                    value={companyData.contact_email}
                    onChange={(e) => setCompanyData(prev => ({ ...prev, contact_email: e.target.value }))}
                  />
                </div>
              </div>
            </>
          )}

          {currentStep === 1 && (
            <>
              <div className="space-y-2">
                <Label htmlFor="address">Endereço</Label>
                <Input
                  id="address"
                  placeholder="Rua, número, complemento"
                  value={addressData.address}
                  onChange={(e) => setAddressData(prev => ({ ...prev, address: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="city">Cidade</Label>
                  <Input
                    id="city"
                    placeholder="São Paulo"
                    value={addressData.city}
                    onChange={(e) => setAddressData(prev => ({ ...prev, city: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="state">Estado</Label>
                  <Select
                    value={addressData.state}
                    onValueChange={(value) => setAddressData(prev => ({ ...prev, state: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {BRAZILIAN_STATES.map((state) => (
                        <SelectItem key={state} value={state}>
                          {state}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="zip_code">CEP</Label>
                <Input
                  id="zip_code"
                  placeholder="00000-000"
                  value={addressData.zip_code}
                  onChange={(e) => setAddressData(prev => ({ ...prev, zip_code: formatCEP(e.target.value) }))}
                  className="max-w-[180px]"
                />
              </div>
            </>
          )}

          {currentStep === 2 && (
            <>
              <div className="flex items-center space-x-2 mb-4">
                <Checkbox
                  id="business_hours_enabled"
                  checked={businessHours.enabled}
              onCheckedChange={(checked) => setBusinessHours(prev => ({ ...prev, enabled: Boolean(checked) }))}
                />
                <Label htmlFor="business_hours_enabled" className="cursor-pointer">
                  Habilitar verificação de horário de expediente
                </Label>
              </div>

              {businessHours.enabled && (
                <>
                  <div className="p-4 bg-muted/50 rounded-lg border">
                    <p className="text-sm text-muted-foreground mb-4">
                      O sistema não considerará PCs offline como falhas fora do horário de expediente configurado.
                    </p>

                    <div className="space-y-4">
                      <div>
                        <Label className="mb-2 block">Dias da semana</Label>
                        <div className="flex flex-wrap gap-2">
                          {DAYS_OF_WEEK.map((day) => (
                            <Button
                              key={day.value}
                              type="button"
                              variant={businessHours.days.includes(day.value) ? "default" : "outline"}
                              size="sm"
                              onClick={() => toggleDay(day.value)}
                            >
                              {day.label}
                            </Button>
                          ))}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="start_time">Início do Expediente</Label>
                          <Input
                            id="start_time"
                            type="time"
                            value={businessHours.start}
                            onChange={(e) => setBusinessHours(prev => ({ ...prev, start: e.target.value }))}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="end_time">Fim do Expediente</Label>
                          <Input
                            id="end_time"
                            type="time"
                            value={businessHours.end}
                            onChange={(e) => setBusinessHours(prev => ({ ...prev, end: e.target.value }))}
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="timezone">Fuso Horário</Label>
                        <Select
                          value={businessHours.timezone}
                          onValueChange={(value) => setBusinessHours(prev => ({ ...prev, timezone: value }))}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {TIMEZONES.map((tz) => (
                              <SelectItem key={tz.value} value={tz.value}>
                                {tz.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </div>

        {/* Navigation Buttons */}
        <div className="flex justify-between pt-4 border-t">
          <Button
            variant="outline"
            onClick={handlePrevious}
            disabled={currentStep === 0 || isSaving}
          >
            <ChevronLeft className="w-4 h-4 mr-2" />
            Anterior
          </Button>
          
          {currentStep < steps.length - 1 ? (
            <Button
              onClick={handleNext}
              disabled={!validateStep(currentStep)}
            >
              Próximo
              <ChevronRight className="w-4 h-4 ml-2" />
            </Button>
          ) : (
            <Button
              onClick={handleComplete}
              disabled={!validateStep(currentStep) || isSaving}
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Salvando...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4 mr-2" />
                  Concluir
                </>
              )}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
