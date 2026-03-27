import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { z } from 'https://esm.sh/zod@3.23.8';
import { corsHeaders } from '../_shared/cors.ts';
import { authenticateApiKey, logApiRequest } from '../_shared/api-auth.ts';
import { checkRateLimit } from '../_shared/rate-limit.ts';
import { logger } from '../_shared/logger.ts';

// Validation schemas
const ApiKeySchema = z.string()
  .min(32, 'Invalid API key format')
  .max(256, 'API key too long')
  .regex(/^[a-zA-Z0-9_-]+$/, 'Invalid API key characters');

const IpAddressSchema = z.string()
  .max(45)
  .optional()
  .default('unknown');

const UserAgentSchema = z.string()
  .max(512)
  .optional()
  .default('unknown');

Deno.serve(async (req) => {
  const startTime = Date.now();
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Extract and validate API key from Authorization header
    const rawApiKey = req.headers.get('Authorization')?.replace('Bearer ', '');
    
    if (!rawApiKey) {
      return new Response(
        JSON.stringify({ error: 'Missing API key' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Validate API key format
    const apiKeyValidation = ApiKeySchema.safeParse(rawApiKey);
    if (!apiKeyValidation.success) {
      logger.warn('Invalid API key format received');
      return new Response(
        JSON.stringify({ error: 'Invalid API key format' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }
    
    const apiKey = apiKeyValidation.data;

    // Authenticate
    const authResult = await authenticateApiKey(apiKey, supabaseUrl, supabaseServiceKey);
    
    if (!authResult.success) {
      return new Response(
        JSON.stringify({ error: 'Authentication failed' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Rate limiting
    const rateLimitResult = await checkRateLimit(supabase, authResult.apiKeyId!, 'api-tenant-info', {
      maxRequests: 100,
      windowMinutes: 1,
      blockMinutes: 5,
    });

    if (!rateLimitResult.allowed) {
      return new Response(
        JSON.stringify({ 
          error: 'Rate limit exceeded',
          resetAt: rateLimitResult.resetAt 
        }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch tenant info
    const { data: tenant, error } = await supabase
      .from('tenants')
      .select('id, name, slug, created_at, updated_at')
      .eq('id', authResult.tenantId!)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      logger.error('Database error in api-tenant-info:', error.message);
      throw new Error('Failed to fetch tenant info');
    }

    const responseTimeMs = Date.now() - startTime;

    // Validate and sanitize header values for logging
    const rawIpAddress = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
    const rawUserAgent = req.headers.get('user-agent');
    
    const ipAddress = IpAddressSchema.parse(rawIpAddress);
    const userAgent = UserAgentSchema.parse(rawUserAgent?.substring(0, 512));

    // Log request
    await logApiRequest(supabase, {
      apiKeyId: authResult.apiKeyId!,
      tenantId: authResult.tenantId!,
      endpoint: '/api/tenant/info',
      method: req.method,
      statusCode: 200,
      responseTimeMs,
      ipAddress,
      userAgent,
    });

    return new Response(
      JSON.stringify(tenant),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    logger.error('Error in api-tenant-info:', error);
    return new Response(
      JSON.stringify({ error: 'An error occurred. Please try again.' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
