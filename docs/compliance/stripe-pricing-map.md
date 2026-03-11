# Stripe Pricing V4 - Internal Documentation

> Created: 2025-12-27

## Overview

CyberShield V4 pricing structure with B2B-only focus, device addons, and MSP volume discounts.

## Plan Structure

### Active Plans (Public)

| Plan | Base Price | Base Devices | Max Devices | Addon Price |
|------|------------|--------------|-------------|-------------|
| **Starter Compliance** | R$ 499/mês | 10 | 50 | R$ 39/dispositivo |
| **Business** | R$ 899/mês | 20 | 200 | R$ 24/dispositivo |
| **Enterprise** | A partir de R$ 2.000/mês | 200+ | Unlimited | Custom |

### Stripe Price IDs

| Description | Price ID | Product ID | Intervalo |
|-------------|----------|------------|-----------|
| Starter Compliance (mensal) | `price_1T9ltDFeHfNScQDPDCs2evWV` | `prod_U81x6fHQIeM2B8` | Mensal |
| Starter Compliance (semestral) | `price_1T9ltFFeHfNScQDPeRUkIwPy` | `prod_U81x5Z106W0Pl4` | Semestral |
| Starter Compliance (anual) | `price_1T9ltGFeHfNScQDPF824aEpL` | `prod_U81xt5IIkzkAS8` | Anual |
| Business (mensal) | `price_1T9lV8FeHfNScQDPfQJhglVa` | `prod_U81YkX1Yl5sjcV` | Mensal |
| Business (semestral) | `price_1T9ltIFeHfNScQDPJUHs3Jmt` | `prod_U81xJiwcNhif30` | Semestral |
| Business (anual) | `price_1T9ltJFeHfNScQDPplay00VK` | `prod_U81xa1XgLZIgzg` | Anual |
| Starter Device Addon | `price_1Sj53iFeHfNScQDPS7pve80k` | `prod_TgRxLbexC5TDBS` | Mensal |
| Business Device Addon | `price_1Sj542FeHfNScQDPpgdjaKx1` | `prod_TgRxsLyISsc36X` | Mensal |

### MSP Coupons (Volume Discounts)

| Level | Coupon ID | Min Devices | Discount |
|-------|-----------|-------------|----------|
| MSP Level 1 | `17IEYGD3` | 100 | 15% |
| MSP Level 2 | `uJ5hLxn9` | 300 | 25% |
| MSP Level 3 | `quY2WQ8h` | 1000 | 35% |

## Legacy Plans (Frozen)

These plans are **NOT available for new signups** but existing subscribers can continue:

### Residential (Removed from B2B focus)
- `basico_residencial`
- `completo_residencial`
- `avancado_residencial`
- `home_basic`
- `home_complete`
- `home_advanced`

### Old Business Plans (Replaced)
- `starter` (old)
- `pro` (old)
- `scale` (old)

### Old Term Plans (Replaced)
- `starter_6m`, `starter_12m`, `starter_24m`
- `pro_6m`, `pro_12m`, `pro_24m`
- `scale_6m`, `scale_12m`, `scale_24m`

## Database Tables

### `subscription_plans`
Contains plan definitions. V4 plans are marked with `is_active = true`.

### `stripe_plan_mapping`
Audit table mapping Stripe IDs to logical plans. Used for reporting and debugging.

### `tenant_subscriptions`
Added columns:
- `is_legacy` (boolean): True for grandfathered customers on old plans
- `addon_devices` (integer): Number of extra devices beyond base

### `v_tenant_plan_status` (View)
Consolidated view showing:
- `plan_name`
- `base_devices`
- `addon_devices`
- `total_devices`
- `is_legacy`
- `status`

## Checkout Flow

1. **Plan Selection**: User selects `starter_compliance` or `business`
2. **Device Count**: Optional `extraDevices` parameter for addons
3. **MSP Check**: Automatically applies coupon if total_devices >= 100
4. **Stripe Session**: Creates subscription with base + addon line items
5. **Trial**: 14 days free (card required)

## Upgrade Rules

| Operation | Behavior |
|-----------|----------|
| **Upgrade** | Use `updateSubscription`, never create new |
| **Add Devices** | Add addon items, don't change plan |
| **Downgrade** | Schedule for next billing cycle |

## Grandfathering Policy

Customers on legacy plans:
- ✅ Keep their current pricing
- ✅ Can continue renewing
- ❌ Cannot access new features
- ℹ️ See banner: "Você está em um plano legado. Novos recursos estão disponíveis nos planos atuais."

## Code References

- **Constants**: `src/constants/plans.ts`
- **Legacy Constants**: `src/constants/stripePricing.ts` (deprecated)
- **Checkout Function**: `supabase/functions/create-checkout/index.ts`
- **Upgrade Modal**: `src/components/UpgradeModal.tsx`
- **Upgrade Hook**: `src/hooks/useUpgradeFlow.tsx`

## Annual Plans (Future)

Annual plans should be communicated as:
> "Benefícios exclusivos no plano anual"

Benefits (not "discounts"):
- Extended log retention
- Automatic reports
- Roadmap priority
- Extended audit history

---

*Last updated: 2025-12-27*
