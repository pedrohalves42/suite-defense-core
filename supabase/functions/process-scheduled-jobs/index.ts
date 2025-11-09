import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID();
  console.log(`[${requestId}] Processing scheduled jobs`);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const now = new Date().toISOString();
    let processedCount = 0;
    let createdRecurringCount = 0;

    // 1. Process one-time scheduled jobs that are due
    const { data: scheduledJobs, error: scheduledError } = await supabase
      .from('jobs')
      .select('*')
      .eq('status', 'queued')
      .eq('is_recurring', false)
      .not('scheduled_at', 'is', null)
      .lte('scheduled_at', now)
      .limit(100);

    if (scheduledError) {
      console.error(`[${requestId}] Error fetching scheduled jobs:`, scheduledError);
      throw scheduledError;
    }

    console.log(`[${requestId}] Found ${scheduledJobs?.length || 0} one-time scheduled jobs to process`);

    // Update status to queued and remove scheduled_at so they get picked up by agents
    if (scheduledJobs && scheduledJobs.length > 0) {
      const jobIds = scheduledJobs.map(j => j.id);
      
      const { error: updateError } = await supabase
        .from('jobs')
        .update({ 
          status: 'queued',
          scheduled_at: null // Clear scheduled_at so it's available immediately
        })
        .in('id', jobIds);

      if (updateError) {
        console.error(`[${requestId}] Error updating scheduled jobs:`, updateError);
      } else {
        processedCount = scheduledJobs.length;
        console.log(`[${requestId}] Activated ${processedCount} scheduled jobs`);
      }
    }

    // 2. Process recurring jobs that are due
    const { data: recurringJobs, error: recurringError } = await supabase
      .from('jobs')
      .select('*')
      .eq('is_recurring', true)
      .eq('approved', true)
      .not('next_run_at', 'is', null)
      .lte('next_run_at', now)
      .limit(50);

    if (recurringError) {
      console.error(`[${requestId}] Error fetching recurring jobs:`, recurringError);
      throw recurringError;
    }

    console.log(`[${requestId}] Found ${recurringJobs?.length || 0} recurring jobs to process`);

    if (recurringJobs && recurringJobs.length > 0) {
      for (const recurringJob of recurringJobs) {
        try {
          // Calculate next run time
          const { data: nextRunData, error: nextRunError } = await supabase
            .rpc('calculate_next_run', { 
              pattern: recurringJob.recurrence_pattern,
              from_time: now
            });

          if (nextRunError) {
            console.error(`[${requestId}] Error calculating next run for job ${recurringJob.id}:`, nextRunError);
            continue;
          }

          // Create a new job instance
          const { error: insertError } = await supabase
            .from('jobs')
            .insert({
              agent_name: recurringJob.agent_name,
              type: recurringJob.type,
              payload: recurringJob.payload,
              status: 'queued',
              approved: true,
              tenant_id: recurringJob.tenant_id,
              parent_job_id: recurringJob.id,
              is_recurring: false
            });

          if (insertError) {
            console.error(`[${requestId}] Error creating job instance for ${recurringJob.id}:`, insertError);
            continue;
          }

          // Update the recurring job with new next_run_at and last_run_at
          const { error: updateRecurringError } = await supabase
            .from('jobs')
            .update({
              last_run_at: now,
              next_run_at: nextRunData
            })
            .eq('id', recurringJob.id);

          if (updateRecurringError) {
            console.error(`[${requestId}] Error updating recurring job ${recurringJob.id}:`, updateRecurringError);
            continue;
          }

          createdRecurringCount++;
          console.log(`[${requestId}] Created instance of recurring job ${recurringJob.id}, next run at ${nextRunData}`);
        } catch (error) {
          console.error(`[${requestId}] Error processing recurring job ${recurringJob.id}:`, error);
        }
      }
    }

    const result = {
      success: true,
      processedScheduled: processedCount,
      createdRecurring: createdRecurringCount,
      timestamp: now
    };

    console.log(`[${requestId}] Completed:`, result);

    return new Response(
      JSON.stringify(result),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error(`[${requestId}] Fatal error:`, error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return new Response(
      JSON.stringify({ 
        success: false,
        error: errorMessage,
        timestamp: new Date().toISOString()
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
