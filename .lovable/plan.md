

## Problem

Multiple components navigate to `/admin/enrollment-keys`, but that route doesn't exist — it's only defined at `/super-admin/enrollment-keys`. This causes a 404 page when users click "Chaves de Instalação" or "Nova Chave de Instalação" from the agent details drawer, onboarding banner, quick actions, etc.

**Affected components (6):**
- `AgentDetailsDrawer.tsx` — 2 links to `/admin/enrollment-keys`
- `OnboardingRequiredBanner.tsx` — 2 links to `/admin/enrollment-keys`
- `AgentQuickActions.tsx` — 1 link to `/admin/enrollment-keys`
- `AutomatedOnboardingWizard.tsx` — 2 links to `/admin/enrollment-keys`

**Components correctly using `/super-admin/enrollment-keys`:**
- `GlobalSearch.tsx`, `AppSidebar.tsx`, `PreserveReinstallSection.tsx`

## Solution

Two changes:

### 1. Add redirect route in App.tsx
Add `enrollment-keys` as a redirect under `/admin` routes pointing to `/super-admin/enrollment-keys`:
```
<Route path="enrollment-keys" element={<Navigate to="/super-admin/enrollment-keys" replace />} />
```

This is the safest approach — fixes all existing links immediately and any future ones that use `/admin/enrollment-keys`.

### 2. Update component navigation paths (consistency)
Update the 6 navigation calls in the 4 affected components to use `/super-admin/enrollment-keys` directly, so they don't depend on the redirect.

**Files modified:** `src/App.tsx` + 4 components (7 line changes total)

