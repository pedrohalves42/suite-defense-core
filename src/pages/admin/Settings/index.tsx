import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Shield } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSettingsData } from './useSettingsData';
import { CompanyTab } from './tabs/CompanyTab';
import { AlertsTab } from './tabs/AlertsTab';
import { IntegrationsTab } from './tabs/IntegrationsTab';
import { FeaturesTab } from './tabs/FeaturesTab';
import { SecurityTab } from './tabs/SecurityTab';

export default function Settings() {
  const { t } = useTranslation();
  const {
    tenant, canWrite, loading,
    tenantName, setTenantName,
    settings, setSettings,
    updateTenant, updateSettings,
  } = useSettingsData();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      </div>
    );
  }

  const saveSettings = () => updateSettings.mutate(settings);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold">{t('adminPages.settings.title')}</h2>
        <p className="text-muted-foreground">{t('adminPages.settings.subtitle')}</p>
      </div>

      <Tabs defaultValue="empresa" className="w-full">
        <TabsList>
          <TabsTrigger value="empresa">{t('adminPages.settings.companyTab')}</TabsTrigger>
          <TabsTrigger value="security" className="flex items-center gap-1">
            <Shield className="h-4 w-4" />
            {t('adminPages.settings.securityTab')}
          </TabsTrigger>
          <TabsTrigger value="alerts">{t('adminPages.settings.alertsTab')}</TabsTrigger>
          <TabsTrigger value="integrations">{t('adminPages.settings.integrationsTab')}</TabsTrigger>
          <TabsTrigger value="features">{t('adminPages.settings.featuresTab')}</TabsTrigger>
        </TabsList>

        <TabsContent value="empresa" className="space-y-4">
          <CompanyTab tenant={tenant} tenantName={tenantName} setTenantName={setTenantName} canWrite={canWrite} onSave={() => updateTenant.mutate()} isSaving={updateTenant.isPending} />
        </TabsContent>
        <TabsContent value="security" className="space-y-4">
          <SecurityTab />
        </TabsContent>
        <TabsContent value="alerts" className="space-y-4">
          <AlertsTab settings={settings} setSettings={setSettings} canWrite={canWrite} tenantId={tenant?.id} onSave={saveSettings} isSaving={updateSettings.isPending} />
        </TabsContent>
        <TabsContent value="integrations" className="space-y-4">
          <IntegrationsTab settings={settings} setSettings={setSettings} canWrite={canWrite} onSave={saveSettings} isSaving={updateSettings.isPending} />
        </TabsContent>
        <TabsContent value="features" className="space-y-4">
          <FeaturesTab settings={settings} setSettings={setSettings} canWrite={canWrite} onSave={saveSettings} isSaving={updateSettings.isPending} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
