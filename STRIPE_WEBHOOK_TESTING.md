# Stripe Webhook Security Testing Guide

## Overview
This guide explains how to test the Stripe webhook signature verification to ensure it properly rejects unauthorized requests and only accepts legitimate Stripe events.

## Prerequisites

1. **Stripe CLI installed**
   ```bash
   # macOS
   brew install stripe/stripe-cli/stripe
   
   # Windows (using Scoop)
   scoop bucket add stripe https://github.com/stripe/scoop-stripe-cli.git
   scoop install stripe
   
   # Linux
   wget https://github.com/stripe/stripe-cli/releases/latest/download/stripe_linux_x86_64.tar.gz
   tar -xvf stripe_linux_x86_64.tar.gz
   sudo mv stripe /usr/local/bin/
   ```

2. **Stripe Account**
   - Log in to [Stripe Dashboard](https://dashboard.stripe.com/)
   - Get your webhook signing secret

## Setup Instructions

### 1. Configure Webhook Secret

Get your webhook signing secret from Stripe:
1. Go to Stripe Dashboard → Developers → Webhooks
2. Click on your webhook endpoint or create a new one
3. Copy the "Signing secret" (starts with `whsec_`)

Add it to your environment:
```bash
# In your Supabase project settings or .env file
STRIPE_WEBHOOK_SECRET=whsec_your_secret_here
```

### 2. Login to Stripe CLI

```bash
stripe login
```

This will open a browser window to authorize the CLI.

## Testing Scenarios

### Test 1: Valid Signature (Should Succeed ✅)

Send a test event with valid signature:

```bash
# Get your webhook endpoint URL
WEBHOOK_URL="https://iavbnmduxpxhwubqrzzn.supabase.co/functions/v1/stripe-webhook"

# Forward Stripe events to your local/production webhook
stripe listen --forward-to $WEBHOOK_URL

# In another terminal, trigger a test event
stripe trigger checkout.session.completed
```

**Expected Result:**
- ✅ Event is accepted
- ✅ Response status: 200 OK
- ✅ Audit log entry created with action: `stripe_webhook_verified`
- ✅ Console log: "Webhook signature verified"

### Test 2: Missing Signature Header (Should Fail ❌)

Send a request without the Stripe signature header:

```bash
curl -X POST https://iavbnmduxpxhwubqrzzn.supabase.co/functions/v1/stripe-webhook \
  -H "Content-Type: application/json" \
  -d '{"type": "checkout.session.completed", "data": {"object": {}}}'
```

**Expected Result:**
- ❌ Request rejected
- ❌ Response status: 400 Bad Request
- ❌ Response body: `{"error": "Missing stripe-signature header"}`
- ✅ Audit log entry created with action: `stripe_webhook_missing_signature`
- ✅ IP address and user agent logged

### Test 3: Invalid Signature (Should Fail ❌)

Send a request with an invalid/fake signature:

```bash
curl -X POST https://iavbnmduxpxhwubqrzzn.supabase.co/functions/v1/stripe-webhook \
  -H "Content-Type: application/json" \
  -H "stripe-signature: t=1234567890,v1=fakesignature123456789" \
  -d '{"type": "checkout.session.completed", "data": {"object": {}}}'
```

**Expected Result:**
- ❌ Request rejected
- ❌ Response status: 400 Bad Request
- ❌ Response body: `{"error": "Invalid signature"}`
- ✅ Audit log entry created with action: `stripe_webhook_signature_failed`
- ✅ IP address logged for attack detection
- ✅ Console log: "SECURITY ALERT: Webhook signature verification failed"

### Test 4: Repeated Attack Detection (Should Alert 🚨)

Send 5+ invalid signature requests from the same IP within an hour:

```bash
# Send 6 requests with invalid signatures
for i in {1..6}; do
  curl -X POST https://iavbnmduxpxhwubqrzzn.supabase.co/functions/v1/stripe-webhook \
    -H "Content-Type: application/json" \
    -H "stripe-signature: t=1234567890,v1=attack$i" \
    -d '{"type": "checkout.session.completed"}'
  echo "Request $i sent"
  sleep 2
done
```

**Expected Result:**
- ❌ All 6 requests rejected
- ✅ 6 audit log entries created
- ✅ After 5th attempt: Console log "CRITICAL: Multiple signature failures from same IP"
- 🚨 Attack detection triggered

## Monitoring Security Events

### View Audit Logs

Query the audit logs to see security events:

```sql
-- All webhook security events
SELECT 
  created_at,
  action,
  ip_address,
  user_agent,
  details,
  success
FROM audit_logs
WHERE action LIKE 'stripe_webhook%'
ORDER BY created_at DESC
LIMIT 50;

-- Failed signature attempts (potential attacks)
SELECT 
  created_at,
  ip_address,
  user_agent,
  details->>'error' as error_message
FROM audit_logs
WHERE action = 'stripe_webhook_signature_failed'
ORDER BY created_at DESC;

-- Attack detection: IPs with 5+ failures in last hour
SELECT 
  ip_address,
  COUNT(*) as failure_count,
  MAX(created_at) as last_attempt
FROM audit_logs
WHERE 
  action = 'stripe_webhook_signature_failed'
  AND created_at > NOW() - INTERVAL '1 hour'
GROUP BY ip_address
HAVING COUNT(*) >= 5
ORDER BY failure_count DESC;
```

### View Edge Function Logs

Check the Stripe webhook function logs in Supabase:

1. Go to Supabase Dashboard → Edge Functions
2. Select `stripe-webhook` function
3. View logs for real-time monitoring

Look for:
- ✅ `[STRIPE-WEBHOOK] Webhook signature verified`
- ⚠️ `[STRIPE-WEBHOOK] ERROR: Missing stripe-signature header`
- 🚨 `[STRIPE-WEBHOOK] SECURITY ALERT: Webhook signature verification failed`
- 🚨 `[STRIPE-WEBHOOK] CRITICAL: Multiple signature failures from same IP`

## Security Best Practices

1. **Never expose the webhook secret** in client-side code or logs
2. **Rotate webhook secrets** periodically (every 90 days recommended)
3. **Monitor audit logs** regularly for suspicious activity
4. **Set up alerts** for multiple failed attempts from the same IP
5. **Use HTTPS only** for webhook endpoints
6. **Implement IP allowlisting** if possible (Stripe webhook IPs)
7. **Test signature verification** after any webhook code changes

## Troubleshooting

### Problem: "Webhook secret not configured" error

**Solution:**
- Ensure `STRIPE_WEBHOOK_SECRET` is set in environment variables
- Restart the edge function after adding the secret
- Verify the secret starts with `whsec_`

### Problem: Valid Stripe events are rejected

**Solution:**
- Verify you're using the correct webhook signing secret
- Check that the secret matches between Stripe Dashboard and your environment
- Ensure you're not modifying the request body before verification
- Test with Stripe CLI: `stripe listen --forward-to YOUR_URL`

### Problem: Can't find audit logs

**Solution:**
- Verify the `audit_logs` table exists in your database
- Check RLS policies on the audit_logs table
- Use service role key to query audit logs

## Automated Monitoring Script

Create a monitoring script to check for attacks:

```bash
#!/bin/bash
# check-webhook-security.sh

# Query for recent failed attempts
FAILED_COUNT=$(supabase db query "
  SELECT COUNT(*) 
  FROM audit_logs 
  WHERE action = 'stripe_webhook_signature_failed' 
  AND created_at > NOW() - INTERVAL '1 hour'
" | tail -1)

if [ "$FAILED_COUNT" -gt 10 ]; then
  echo "⚠️  ALERT: $FAILED_COUNT failed webhook signature attempts in last hour"
  # Send alert email/notification here
fi
```

## Support

If you encounter issues with webhook signature verification:
1. Check edge function logs in Supabase Dashboard
2. Review audit logs for detailed error messages
3. Test with Stripe CLI to verify proper configuration
4. Ensure webhook secret is correctly configured

## Security Checklist

- ✅ STRIPE_WEBHOOK_SECRET configured in environment
- ✅ Signature verification is mandatory (no bypass)
- ✅ All requests require stripe-signature header
- ✅ Failed attempts are logged to audit_logs
- ✅ IP addresses are tracked for attack detection
- ✅ Monitoring is in place for repeated failures
- ✅ Alerts configured for suspicious activity
- ✅ Webhook URL uses HTTPS
- ✅ Regular testing with Stripe CLI

---

**Last Updated:** 2025-11-10
**Security Status:** ✅ Production Ready
