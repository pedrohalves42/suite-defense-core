/**
 * Sales Pipeline - Migrated to serveTenant middleware
 * Super admin only. CRUD operations for sales pipeline deals.
 */
import { serveTenant } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';
import { z } from 'https://esm.sh/zod@3.23.8';

const CreateDealSchema = z.object({
  company: z.string().min(1).max(255),
  contact: z.string().min(1).max(255),
  stage: z.enum(['lead', 'qualified', 'demo', 'proposal', 'negotiation', 'won', 'lost']).default('lead'),
  probability: z.number().min(0).max(100).default(10),
  value: z.number().min(0).default(0),
  expected_close: z.string().datetime().optional(),
});

const UpdateDealSchema = z.object({
  id: z.string().uuid(),
  company: z.string().min(1).max(255).optional(),
  contact: z.string().min(1).max(255).optional(),
  stage: z.enum(['lead', 'qualified', 'demo', 'proposal', 'negotiation', 'won', 'lost']).optional(),
  probability: z.number().min(0).max(100).optional(),
  value: z.number().min(0).optional(),
  expected_close: z.string().datetime().optional(),
});

serveTenant(async (req, ctx) => {
  const { supabase, userId, requestId, body } = ctx;

  // Verify super_admin role
  const { data: roles } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .eq('role', 'super_admin');

  if (!roles || roles.length === 0) {
    return new Response(
      JSON.stringify({ error: 'Forbidden: Super Admin access required' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  }

  logger.info(`[SALES-PIPELINE][${requestId}] Request ${req.method} from super admin ${userId}`);

  // GET - List all deals with metrics
  if (req.method === 'GET') {
    const { data: deals, error: dealsError } = await supabase
      .from('sales_pipeline')
      .select('*')
      .order('created_at', { ascending: false });

    if (dealsError) throw dealsError;

    const stages = ['lead', 'qualified', 'demo', 'proposal', 'negotiation', 'won', 'lost'];
    const dealsByStage: Record<string, unknown[]> = {};
    stages.forEach(stage => {
      dealsByStage[stage] = deals?.filter((d: Record<string, unknown>) => d.stage === stage) || [];
    });

    const totalValue = deals?.reduce((sum: number, d: Record<string, unknown>) => sum + Number(d.value || 0), 0) || 0;
    const weightedValue = deals?.reduce((sum: number, d: Record<string, unknown>) =>
      sum + (Number(d.value || 0) * (Number(d.probability) || 0) / 100), 0) || 0;

    const wonDeals = (dealsByStage.won as unknown[]).length;
    const lostDeals = (dealsByStage.lost as unknown[]).length;
    const closedDeals = wonDeals + lostDeals;
    const winRate = closedDeals > 0 ? (wonDeals / closedDeals) * 100 : 0;
    const openDeals = (deals?.length || 0) - closedDeals;
    const openValue = deals
      ?.filter((d: Record<string, unknown>) => d.stage !== 'won' && d.stage !== 'lost')
      .reduce((sum: number, d: Record<string, unknown>) => sum + Number(d.value || 0), 0) || 0;

    return {
      deals: deals || [],
      deals_by_stage: dealsByStage,
      metrics: {
        total_deals: deals?.length || 0,
        open_deals: openDeals,
        won_deals: wonDeals,
        lost_deals: lostDeals,
        total_value: Math.round(totalValue * 100) / 100,
        open_value: Math.round(openValue * 100) / 100,
        weighted_value: Math.round(weightedValue * 100) / 100,
        win_rate: Math.round(winRate * 10) / 10,
      },
    };
  }

  // POST - Create new deal
  if (req.method === 'POST') {
    const parsed = CreateDealSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: 'Invalid input', details: parsed.error.flatten().fieldErrors }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const { data: newDeal, error: createError } = await supabase
      .from('sales_pipeline')
      .insert(parsed.data)
      .select()
      .single();

    if (createError) throw createError;

    logger.info(`[SALES-PIPELINE][${requestId}] Created deal: ${newDeal.id}`);
    return new Response(JSON.stringify(newDeal), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // PATCH - Update deal
  if (req.method === 'PATCH') {
    const parsed = UpdateDealSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: 'Invalid input', details: parsed.error.flatten().fieldErrors }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const { id, ...updateData } = parsed.data;
    const { data: updatedDeal, error: updateError } = await supabase
      .from('sales_pipeline')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (updateError) throw updateError;

    logger.info(`[SALES-PIPELINE][${requestId}] Updated deal: ${id}`);
    return updatedDeal;
  }

  // DELETE - Remove deal
  if (req.method === 'DELETE') {
    const url = new URL(req.url);
    const dealId = url.searchParams.get('id');
    if (!dealId) {
      return new Response(
        JSON.stringify({ error: 'Deal ID required as query param' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const { error: deleteError } = await supabase
      .from('sales_pipeline')
      .delete()
      .eq('id', dealId);

    if (deleteError) throw deleteError;

    logger.info(`[SALES-PIPELINE][${requestId}] Deleted deal: ${dealId}`);
    return { success: true };
  }

  return new Response(
    JSON.stringify({ error: 'Method not allowed' }),
    { status: 405, headers: { 'Content-Type': 'application/json' } }
  );
}, {
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  skipTenantValidation: true,
});
