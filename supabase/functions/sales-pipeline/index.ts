import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";
import { logger } from '../_shared/logger.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SalesDeal {
  id: string;
  company: string;
  contact: string;
  stage: string;
  probability: number;
  value: number;
  expected_close: string;
  created_at: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) throw new Error("Unauthorized");

    // Verify super_admin role
    const { data: roles, error: rolesError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userData.user.id)
      .eq('role', 'super_admin');

    if (rolesError || !roles || roles.length === 0) {
      throw new Error("Forbidden: Super Admin access required");
    }

    logger.info(`[SALES-PIPELINE] Request ${req.method} from super admin ${userData.user.id}`);

    // GET - List all deals with metrics
    if (req.method === 'GET') {
      const { data: deals, error: dealsError } = await supabase
        .from('sales_pipeline')
        .select('*')
        .order('created_at', { ascending: false });

      if (dealsError) throw dealsError;

      // Calculate pipeline metrics
      const stages = ['lead', 'qualified', 'demo', 'proposal', 'negotiation', 'won', 'lost'];
      const dealsByStage: Record<string, SalesDeal[]> = {};
      
      stages.forEach(stage => {
        dealsByStage[stage] = deals?.filter((d: any) => d.stage === stage) || [];
      });

      const totalValue = deals?.reduce((sum: number, d: any) => sum + Number(d.value || 0), 0) || 0;
      const weightedValue = deals?.reduce((sum: number, d: any) => 
        sum + (Number(d.value || 0) * (d.probability || 0) / 100), 0) || 0;
      
      const wonDeals = dealsByStage.won.length;
      const lostDeals = dealsByStage.lost.length;
      const closedDeals = wonDeals + lostDeals;
      const winRate = closedDeals > 0 ? (wonDeals / closedDeals) * 100 : 0;

      const openDeals = (deals?.length || 0) - closedDeals;
      const openValue = deals
        ?.filter((d: any) => d.stage !== 'won' && d.stage !== 'lost')
        .reduce((sum: number, d: any) => sum + Number(d.value || 0), 0) || 0;

      const response = {
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

      return new Response(JSON.stringify(response), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // POST - Create new deal
    if (req.method === 'POST') {
      const body = await req.json();
      
      const { data: newDeal, error: createError } = await supabase
        .from('sales_pipeline')
        .insert({
          company: body.company,
          contact: body.contact,
          stage: body.stage || 'lead',
          probability: body.probability || 10,
          value: body.value || 0,
          expected_close: body.expected_close,
        })
        .select()
        .single();

      if (createError) throw createError;

      logger.info(`[SALES-PIPELINE] Created deal: ${newDeal.id}`);

      return new Response(JSON.stringify(newDeal), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 201,
      });
    }

    // PATCH - Update deal
    if (req.method === 'PATCH') {
      const body = await req.json();
      
      if (!body.id) throw new Error("Deal ID required");

      const updateData: Record<string, any> = {};
      if (body.company !== undefined) updateData.company = body.company;
      if (body.contact !== undefined) updateData.contact = body.contact;
      if (body.stage !== undefined) updateData.stage = body.stage;
      if (body.probability !== undefined) updateData.probability = body.probability;
      if (body.value !== undefined) updateData.value = body.value;
      if (body.expected_close !== undefined) updateData.expected_close = body.expected_close;

      const { data: updatedDeal, error: updateError } = await supabase
        .from('sales_pipeline')
        .update(updateData)
        .eq('id', body.id)
        .select()
        .single();

      if (updateError) throw updateError;

      logger.info(`[SALES-PIPELINE] Updated deal: ${body.id}`);

      return new Response(JSON.stringify(updatedDeal), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // DELETE - Remove deal
    if (req.method === 'DELETE') {
      const url = new URL(req.url);
      const dealId = url.searchParams.get('id');
      
      if (!dealId) throw new Error("Deal ID required");

      const { error: deleteError } = await supabase
        .from('sales_pipeline')
        .delete()
        .eq('id', dealId);

      if (deleteError) throw deleteError;

      logger.info(`[SALES-PIPELINE] Deleted deal: ${dealId}`);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    throw new Error("Method not allowed");
  } catch (error) {
    logger.error("[SALES-PIPELINE] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: error instanceof Error && error.message.includes("Forbidden") ? 403 : 500,
      }
    );
  }
});
