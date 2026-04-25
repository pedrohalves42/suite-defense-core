
/**
 * Hexagonal Billing Architecture
 * 
 * Problem:
 * Billing logic was scattered across multiple handlers (billing.ts, billing-stripe.ts),
 * making it hard to test, maintain, and support multiple payment providers.
 * 
 * Solution:
 * Implemented Hexagonal Architecture (Ports and Adapters) to decouple business logic
 * from infrastructure details.
 * 
 * Layers:
 * 1. Domain (Entities & Ports):
 *    - entities.ts: Core business objects (Subscription, ChargeResult).
 *    - ports/: Interfaces defining how the domain interacts with the outside world.
 *      - billing-repository.port.ts: Data persistence.
 *      - payment-gateway.port.ts: Payment processing.
 * 2. Domain (Use Cases):
 *    - use-cases/charge-subscription.ts: Orchestrates the billing process.
 * 3. Infrastructure (Adapters):
 *    - adapters/supabase-billing-repository.ts: Supabase implementation of the repo.
 *    - adapters/stripe-payment-gateway.ts: Stripe implementation of the gateway.
 *    - adapters/manual-payment-gateway.ts: Manual billing for enterprise/offline.
 *    - adapters/test-double-payment-gateway.ts: For CI/CD and unit testing.
 * 
 * Factory:
 * - factory.ts: Centralized logic to instantiate the correct adapters based on environment.
 * 
 * Usage:
 * Inject the UseCase into handlers and call .execute(tenantId).
 */
export const ARCHITECTURE_DOC = true;
