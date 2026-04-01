import { useState } from 'react';
import { useTenantSetup, type TenantSetupData, type BusinessHoursData } from '@/hooks/useTenantSetup';

export function useTenantSetupWizard() {
  const { tenantData, saveSetup, isSaving } = useTenantSetup();
  const [currentStep, setCurrentStep] = useState(0);

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
    { title: 'Dados da Empresa', iconName: 'Building2' as const, description: 'Informações básicas' },
    { title: 'Endereço', iconName: 'MapPin' as const, description: 'Localização da empresa' },
    { title: 'Horário de Expediente', iconName: 'Clock' as const, description: 'Configurar monitoramento' },
  ];

  const validateStep = (step: number): boolean => {
    switch (step) {
      case 0: return companyData.company_name.trim().length > 0;
      case 1: return true;
      case 2: return !businessHours.enabled || (businessHours.days.length > 0 && !!businessHours.start && !!businessHours.end);
      default: return true;
    }
  };

  const handleNext = () => {
    if (currentStep < steps.length - 1 && validateStep(currentStep)) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) setCurrentStep(currentStep - 1);
  };

  const handleComplete = async () => {
    if (!validateStep(currentStep)) return;
    const data: TenantSetupData = { company: companyData, address: addressData, businessHours };
    await saveSetup(data);
  };

  const toggleDay = (day: string) => {
    setBusinessHours(prev => ({
      ...prev,
      days: prev.days.includes(day) ? prev.days.filter(d => d !== day) : [...prev.days, day],
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

  return {
    currentStep, steps, isSaving,
    companyData, setCompanyData,
    addressData, setAddressData,
    businessHours, setBusinessHours,
    validateStep, handleNext, handlePrevious, handleComplete,
    toggleDay, formatCNPJ, formatPhone, formatCEP,
  };
}
