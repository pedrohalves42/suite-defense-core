
import { BillingRepository } from '../ports/billing-repository.port.ts';
import { CohortData, UnitEconomics } from '../entities.ts';
import { handleExceptionWithContext } from '../../../error-handler.ts';

export class BillingAnalyticsUseCase {
  constructor(private billingRepo: BillingRepository) {}

  async getCohortAnalysis(traceId?: string): Promise<any> {
    const start = Date.now();
    try {
      const tenants = await this.billingRepo.getAllTenants();
      const subscriptions = await this.billingRepo.getAllActiveSubscriptions();

      const cohortMap = new Map<string, string[]>();
      tenants.forEach(t => {
        const month = t.createdAt.slice(0, 7);
        if (!cohortMap.has(month)) cohortMap.set(month, []);
        cohortMap.get(month)!.push(t.id);
      });

      const cohorts: CohortData[] = [];
      const now = new Date();

      for (const [month, tenantIds] of cohortMap.entries()) {
        const cohortDate = new Date(month + '-01');
        const monthsSinceCreation = Math.floor((now.getTime() - cohortDate.getTime()) / (30 * 24 * 60 * 60 * 1000));
        
        const cohortSubs = subscriptions.filter(s => tenantIds.includes(s.tenantId));
        const activeCount = cohortSubs.length;
        const retentionRate = tenantIds.length > 0 ? (activeCount / tenantIds.length) * 100 : 0;
        
        const retentionByMonth: number[] = [];
        for (let i = 0; i <= Math.min(monthsSinceCreation, 12); i++) {
          retentionByMonth.push(Math.round(Math.max(0, retentionRate - i * (100 - retentionRate) / 12) * 10) / 10);
        }

        cohorts.push({
          month,
          total: tenantIds.length,
          active: activeCount,
          churned: tenantIds.length - activeCount,
          retentionRate: Math.round(retentionRate * 10) / 10,
          monthsSinceCreation: retentionByMonth
        });
      }

      cohorts.sort((a, b) => b.month.localeCompare(a.month));
      return { cohorts: cohorts.slice(0, 12) };
    } catch (error) {
      await handleExceptionWithContext(error, {
        traceId: traceId || crypto.randomUUID(),
        operation: 'BillingAnalyticsUseCase.getCohortAnalysis',
        latency: Date.now() - start
      });
      throw error;
    }
  }

  async getUnitEconomics(traceId?: string): Promise<UnitEconomics> {
    const start = Date.now();
    try {
      const subscriptions = await this.billingRepo.getAllActiveSubscriptions();
      
      let totalMrr = 0;
      let activeCount = 0;

      for (const sub of subscriptions) {
        if (sub.status === 'active' || sub.status === 'trialing') {
          const plan = await this.billingRepo.getPlanById(sub.planId);
          if (plan) {
            totalMrr += (plan.pricePerDevice / 100) * sub.deviceQuantity;
            activeCount++;
          }
        }
      }

      const marketingCosts = await this.billingRepo.getMarketingCosts();
      const totalSpend = marketingCosts.reduce((sum, cost) => sum + Number(cost.spend_cents || 0) / 100, 0);
      const totalConversions = marketingCosts.reduce((sum, cost) => sum + (Number(cost.conversions) || 0), 0);
      
      const cac = totalConversions > 0 ? totalSpend / totalConversions : 0;
      const arpa = activeCount > 0 ? totalMrr / activeCount : 0;
      
      const threeMonthsAgo = new Date();
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
      const canceledCount = await this.billingRepo.getCanceledSubscriptions(threeMonthsAgo.toISOString());
      
      const monthlyChurnRate = (activeCount + canceledCount) > 0 ? (canceledCount / 3) / (activeCount + canceledCount) : 0.05;
      const grossMargin = 0.85;
      const ltv = monthlyChurnRate > 0 ? (arpa * grossMargin) / monthlyChurnRate : arpa * 12;

      return {
        mrr: Math.round(totalMrr * 100) / 100,
        arr: Math.round(totalMrr * 12 * 100) / 100,
        arpa: Math.round(arpa * 100) / 100,
        cac: Math.round(cac * 100) / 100,
        ltv: Math.round(ltv * 100) / 100,
        ltvCacRatio: cac > 0 ? Math.round((ltv / cac) * 100) / 100 : 0,
        paybackMonths: arpa > 0 ? Math.round((cac / (arpa * grossMargin)) * 10) / 10 : 0,
        churnRate: Math.round(monthlyChurnRate * 1000) / 10,
        grossMargin: grossMargin * 100,
        activeCustomers: activeCount
      };
    } catch (error) {
      await handleExceptionWithContext(error, {
        traceId: traceId || crypto.randomUUID(),
        operation: 'BillingAnalyticsUseCase.getUnitEconomics',
        latency: Date.now() - start
      });
      throw error;
    }
  }
}
