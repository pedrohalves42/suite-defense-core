/**
 * HTTP Method Validator - QUAL-01 Fix
 * Validates HTTP methods and returns 405 Method Not Allowed for invalid methods
 */

import { corsHeaders } from './cors.ts'

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'OPTIONS'

/**
 * Validates if the request method is allowed
 * @param req - The incoming request
 * @param allowedMethods - Array of allowed HTTP methods
 * @returns Response with 405 status if method not allowed, null if valid
 */
export function validateHttpMethod(
  req: Request, 
  allowedMethods: HttpMethod[]
): Response | null {
  // Always allow OPTIONS for CORS preflight
  if (req.method === 'OPTIONS') {
    return null // Handled separately by caller
  }
  
  if (!allowedMethods.includes(req.method as HttpMethod)) {
    return new Response(
      JSON.stringify({ 
        error: 'Method not allowed',
        allowed: allowedMethods.join(', ')
      }),
      { 
        status: 405, 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json',
          'Allow': allowedMethods.join(', ')
        } 
      }
    )
  }
  
  return null
}

/**
 * Creates a standard OPTIONS response for CORS preflight
 */
export function handleCorsPreflightRequest(): Response {
  return new Response(null, { headers: corsHeaders })
}
