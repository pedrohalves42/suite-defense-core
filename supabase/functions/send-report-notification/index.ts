import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { logger } from '../_shared/logger.ts';
import { buildCorsHeaders } from '../_shared/cors.ts';



interface NotificationPayload {
  report_id?: string;
  tenant_id?: string;
  force?: boolean;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: buildCorsHeaders(origin) });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...buildCorsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const payload: NotificationPayload = await req.json().catch(() => ({}));
    
    // Get pending notifications from queue
    let query = supabase
      .from("notification_queue")
      .select(`
        *,
        generated_reports!notification_queue_report_id_fkey (
          id, title, commercial_summary, commercial_priority, risk_score, risk_level, agent_name, report_type
        )
      `)
      .eq("status", "pending")
      .lte("scheduled_for", new Date().toISOString())
      .order("created_at", { ascending: true })
      .limit(50);

    if (payload.report_id) {
      query = query.eq("report_id", payload.report_id);
    }
    if (payload.tenant_id) {
      query = query.eq("tenant_id", payload.tenant_id);
    }

    const { data: notifications, error: fetchError } = await query;

    if (fetchError) {
      logger.error("Error fetching notifications:", fetchError);
      throw fetchError;
    }

    if (!notifications || notifications.length === 0) {
      return new Response(JSON.stringify({ 
        success: true, 
        message: "No pending notifications",
        processed: 0 
      }), {
        status: 200,
        headers: { ...buildCorsHeaders(origin), "Content-Type": "application/json" },
      });
    }

    logger.info(`Processing ${notifications.length} pending notifications`);

    let sentCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    for (const notification of notifications) {
      try {
        const report = notification.generated_reports;
        
        // Check if should notify: only high priority or trial tenants
        const { data: subscription } = await supabase
          .from("tenant_subscriptions")
          .select("status, plan_id")
          .eq("tenant_id", notification.tenant_id)
          .single();

        const isTrialing = subscription?.status === "trialing";
        const isHighPriority = report?.commercial_priority === "high";

        if (!isHighPriority && !isTrialing && !payload.force) {
          // Skip notification for non-high priority, non-trial tenants
          await supabase
            .from("notification_queue")
            .update({ 
              status: "skipped", 
              error_message: "Not high priority and not in trial" 
            })
            .eq("id", notification.id);
          skippedCount++;
          continue;
        }

        // Get tenant admin emails
        const { data: admins } = await supabase
          .from("user_roles")
          .select("user_id")
          .eq("tenant_id", notification.tenant_id)
          .in("role", ["admin", "super_admin"]);

        if (!admins || admins.length === 0) {
          await supabase
            .from("notification_queue")
            .update({ 
              status: "failed", 
              error_message: "No admin users found" 
            })
            .eq("id", notification.id);
          failedCount++;
          continue;
        }

        // Get admin emails from auth.users
        const adminIds = admins.map(a => a.user_id);
        const { data: users } = await supabase.auth.admin.listUsers();
        const adminEmails = users?.users
          .filter(u => adminIds.includes(u.id))
          .map(u => u.email)
          .filter(Boolean) as string[];

        if (adminEmails.length === 0) {
          await supabase
            .from("notification_queue")
            .update({ 
              status: "failed", 
              error_message: "No admin emails found" 
            })
            .eq("id", notification.id);
          failedCount++;
          continue;
        }

        // Process by channel
        let success = false;
        let errorMessage = "";

        if (notification.channel === "email") {
          // Send email via Resend
          const resendKey = Deno.env.get("RESEND_API_KEY");
          if (resendKey) {
            try {
              const resend = new Resend(resendKey);
              const riskEmoji = report?.risk_level === "CRITICO" ? "?" : 
                               report?.risk_level === "ALTO" ? "?" : 
                               report?.risk_level === "MEDIO" ? "?" : "?";

              await resend.emails.send({
                from: "CyberShield <alertas@cybershield.com.br>",
                to: adminEmails,
                subject: `${riskEmoji} Laudo de Seguranca: ${report?.title || "Novo Laudo"}`,
                html: `
                  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #1a1a2e;">?? CyberShield - Laudo de Seguranca</h2>
                    <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
                      <h3>${report?.title || "Laudo Gerado"}</h3>
                      <p><strong>Agente:</strong> ${report?.agent_name || "Consolidado"}</p>
                      <p><strong>Nivel de Risco:</strong> ${riskEmoji} ${report?.risk_level || "N/A"} (Score: ${report?.risk_score || 0})</p>
                    </div>
                    <div style="background: #fff3cd; padding: 15px; border-radius: 8px; border-left: 4px solid #ffc107;">
                      <h4>? Resumo Comercial:</h4>
                      <p>${report?.commercial_summary || notification.message_content || "Laudo gerado automaticamente."}</p>
                    </div>
                    <div style="margin-top: 20px; text-align: center;">
                      <a href="${supabaseUrl.replace('.supabase.co', '.lovable.dev')}/admin/reports" 
                         style="background: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                        Ver Laudo Completo
                      </a>
                    </div>
                    <p style="color: #666; font-size: 12px; margin-top: 30px;">
                      Esta e uma notificacao automatica do sistema CyberShield.
                    </p>
                  </div>
                `,
              });
              success = true;
            } catch (emailError: Record<string, unknown>) {
              errorMessage = `Email error: ${emailError.message}`;
              logger.error("Email send error:", emailError);
            }
          } else {
            errorMessage = "RESEND_API_KEY not configured";
          }
        } else if (notification.channel === "dashboard") {
          // Dashboard notifications are always successful (just marking as sent)
          success = true;
        } else if (notification.channel === "whatsapp") {
          // WhatsApp integration placeholder - would need Twilio/Z-API setup
          errorMessage = "WhatsApp integration not configured";
          // For now, fallback to email
          await supabase.from("notification_queue").insert({
            tenant_id: notification.tenant_id,
            report_id: notification.report_id,
            channel: "email",
            priority: notification.priority,
            message_content: notification.message_content,
            scheduled_for: new Date().toISOString(),
          });
          success = true; // Consider as handled by creating email fallback
        }

        // Update notification status
        await supabase
          .from("notification_queue")
          .update({ 
            status: success ? "sent" : "failed",
            sent_at: success ? new Date().toISOString() : null,
            error_message: errorMessage || null,
            retry_count: notification.retry_count + (success ? 0 : 1)
          })
          .eq("id", notification.id);

        if (success) {
          sentCount++;
        } else {
          failedCount++;
        }

      } catch (notifError: Record<string, unknown>) {
        logger.error(`Error processing notification ${notification.id}:`, notifError);
        await supabase
          .from("notification_queue")
          .update({ 
            status: "failed",
            error_message: notifError.message,
            retry_count: notification.retry_count + 1
          })
          .eq("id", notification.id);
        failedCount++;
      }
    }

    // Log results
    logger.info(`Notification processing complete: sent=${sentCount}, skipped=${skippedCount}, failed=${failedCount}`);

    return new Response(JSON.stringify({
      success: true,
      processed: notifications.length,
      sent: sentCount,
      skipped: skippedCount,
      failed: failedCount
    }), {
      status: 200,
      headers: { ...buildCorsHeaders(origin), "Content-Type": "application/json" },
    });

  } catch (error: Record<string, unknown>) {
    logger.error("Error in send-report-notification:", error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message 
    }), {
      status: 500,
      headers: { ...buildCorsHeaders(origin), "Content-Type": "application/json" },
    });
  }
});
