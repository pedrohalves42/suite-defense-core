/**
 * send-report-notification — Migrated to serveInternal middleware
 */
import { Resend } from "https://esm.sh/resend@2.0.0";
import { serveInternal } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';

interface NotificationPayload {
  report_id?: string;
  tenant_id?: string;
  force?: boolean;
}

serveInternal(async (_req, ctx) => {
  const { supabase, body } = ctx;
  const payload = body as NotificationPayload;
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;

  // Get pending notifications from queue
  let query = supabase
    .from("notification_queue")
    .select(`*, generated_reports!notification_queue_report_id_fkey (id, title, commercial_summary, commercial_priority, risk_score, risk_level, agent_name, report_type)`)
    .eq("status", "pending")
    .lte("scheduled_for", new Date().toISOString())
    .order("created_at", { ascending: true })
    .limit(50);

  if (payload.report_id) query = query.eq("report_id", payload.report_id);
  if (payload.tenant_id) query = query.eq("tenant_id", payload.tenant_id);

  const { data: notifications, error: fetchError } = await query;
  if (fetchError) { logger.error("Error fetching notifications:", fetchError); throw fetchError; }

  if (!notifications || notifications.length === 0) {
    return { success: true, message: "No pending notifications", processed: 0 };
  }

  logger.info(`Processing ${notifications.length} pending notifications`);

  let sentCount = 0, skippedCount = 0, failedCount = 0;

  for (const notification of notifications) {
    try {
      const report = notification.generated_reports;

      const { data: subscription } = await supabase.from("tenant_subscriptions").select("status, plan_id").eq("tenant_id", notification.tenant_id).single();
      const isTrialing = subscription?.status === "trialing";
      const isHighPriority = report?.commercial_priority === "high";

      if (!isHighPriority && !isTrialing && !payload.force) {
        await supabase.from("notification_queue").update({ status: "skipped", error_message: "Not high priority and not in trial" }).eq("id", notification.id);
        skippedCount++;
        continue;
      }

      const { data: admins } = await supabase.from("user_roles").select("user_id").eq("tenant_id", notification.tenant_id).in("role", ["admin", "super_admin"]);
      if (!admins || admins.length === 0) {
        await supabase.from("notification_queue").update({ status: "failed", error_message: "No admin users found" }).eq("id", notification.id);
        failedCount++;
        continue;
      }

      const adminIds = admins.map(a => a.user_id);
      const { data: users } = await supabase.auth.admin.listUsers();
      const adminEmails = users?.users.filter(u => adminIds.includes(u.id)).map(u => u.email).filter(Boolean) as string[];

      if (adminEmails.length === 0) {
        await supabase.from("notification_queue").update({ status: "failed", error_message: "No admin emails found" }).eq("id", notification.id);
        failedCount++;
        continue;
      }

      let success = false;
      let errorMessage = "";

      if (notification.channel === "email") {
        const resendKey = Deno.env.get("RESEND_API_KEY");
        if (resendKey) {
          try {
            const resend = new Resend(resendKey);
            const riskEmoji = report?.risk_level === "CRITICO" ? "🔴" : report?.risk_level === "ALTO" ? "🟠" : report?.risk_level === "MEDIO" ? "🟡" : "🟢";
            await resend.emails.send({
              from: "CyberShield <alertas@cybershield.com.br>", to: adminEmails,
              subject: `${riskEmoji} Laudo de Seguranca: ${report?.title || "Novo Laudo"}`,
              html: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;"><h2 style="color: #1a1a2e;">🛡 CyberShield - Laudo de Seguranca</h2><div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;"><h3>${report?.title || "Laudo Gerado"}</h3><p><strong>Agente:</strong> ${report?.agent_name || "Consolidado"}</p><p><strong>Nivel de Risco:</strong> ${riskEmoji} ${report?.risk_level || "N/A"} (Score: ${report?.risk_score || 0})</p></div><div style="background: #fff3cd; padding: 15px; border-radius: 8px; border-left: 4px solid #ffc107;"><h4>📋 Resumo Comercial:</h4><p>${report?.commercial_summary || notification.message_content || "Laudo gerado automaticamente."}</p></div><div style="margin-top: 20px; text-align: center;"><a href="${supabaseUrl.replace('.supabase.co', '.lovable.dev')}/admin/reports" style="background: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Ver Laudo Completo</a></div><p style="color: #666; font-size: 12px; margin-top: 30px;">Esta e uma notificacao automatica do sistema CyberShield.</p></div>`,
            });
            success = true;
          } catch (emailError) {
            errorMessage = `Email error: ${(emailError as Error).message}`;
            logger.error("Email send error:", emailError);
          }
        } else {
          errorMessage = "RESEND_API_KEY not configured";
        }
      } else if (notification.channel === "dashboard") {
        success = true;
      } else if (notification.channel === "whatsapp") {
        errorMessage = "WhatsApp integration not configured";
        await supabase.from("notification_queue").insert({
          tenant_id: notification.tenant_id, report_id: notification.report_id, channel: "email",
          priority: notification.priority, message_content: notification.message_content, scheduled_for: new Date().toISOString(),
        });
        success = true;
      }

      await supabase.from("notification_queue").update({
        status: success ? "sent" : "failed", sent_at: success ? new Date().toISOString() : null,
        error_message: errorMessage || null, retry_count: notification.retry_count + (success ? 0 : 1)
      }).eq("id", notification.id);

      if (success) sentCount++; else failedCount++;
    } catch (notifError) {
      logger.error(`Error processing notification ${notification.id}:`, notifError);
      await supabase.from("notification_queue").update({ status: "failed", error_message: (notifError as Error).message, retry_count: notification.retry_count + 1 }).eq("id", notification.id);
      failedCount++;
    }
  }

  logger.info(`Notification processing complete: sent=${sentCount}, skipped=${skippedCount}, failed=${failedCount}`);
  return { success: true, processed: notifications.length, sent: sentCount, skipped: skippedCount, failed: failedCount };
});
