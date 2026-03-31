/**
 * CyberShield Windows Script Hotfix - Orchestrator
 * 
 * Applies all hotfixes to the Windows agent script in correct order.
 * Each hotfix group is in its own module under ./hotfix/
 */
import type { WindowsScriptHotfixResult, HotfixContext } from './hotfix/types.ts';
export type { WindowsScriptHotfixResult } from './hotfix/types.ts';

// StrictMode & globals
import { hotfixStrictModeGlobals, hotfixBaselineGlobals, hotfixInitProtectedSet, hotfixRsaGlobalsInit } from './hotfix/strictmode-globals.ts';

// Crypto fallbacks (ECDSA → RSA)
import {
  hotfixLegacyEcdsaFallback, hotfixExportPkcs8RsaFallback, hotfixCngCleanup,
  hotfixRsa2048Fallback, hotfixRsaSignFallback, hotfixRsaAlgoReport,
  hotfixRsaNet4x, hotfixRngNet4x, hotfixNullEcdsaGuard,
  hotfixEcdsaRsaAutoregen, hotfixNullPrivkeyRegen, hotfixOrphanBraceCleanup
} from './hotfix/crypto-fallbacks.ts';

// Safe property access
import {
  hotfixSafeAnomaliesAccess, hotfixSafeForceUpdate, hotfixSafeRepairedAndSha256,
  hotfixSafeRegisteredAt, hotfixSafeEcdsaSig, hotfixSafeCacheSig
} from './hotfix/safe-access.ts';

// Pipeline & type safety
import {
  hotfixPipelineSafeTestCalls, hotfixTypesafeStatus, hotfixLocalDetectTryCatch,
  hotfixUsbCount, hotfixSoftwareCount, hotfixVersionPrefix, hotfixBodyCompress
} from './hotfix/pipeline-typesafe.ts';

// TOCTOU integrity
import {
  hotfixToctouSelfheal, hotfixToctouRuntimeSelfheal, hotfixHeartbeatSha256Sync,
  hotfixToctouDualHash, hotfixPreloggerRepair
} from './hotfix/toctou-integrity.ts';

// Firewall skip
import {
  hotfixSkipFwBoot, hotfixSkipFwPersist, hotfixSkipFwHeartbeatRead,
  hotfixUpgradeFlagPath, hotfixUpgradeGuardFileCheck, hotfixSkipFwGuard, hotfixSkipFwInit
} from './hotfix/firewall-skip.ts';

// Feature additions
import {
  hotfixFailopenUnsigned, hotfixFailopenSig, hotfixAclSid,
  hotfixCollectCerts, hotfixCollectDisk, hotfixDns403Info,
  hotfixBaselineDedup, hotfixBaselineLoadSafe, hotfixBaselineNormalizeSave,
  hotfixRegistrySnapshot, hotfixMultiBrowser, hotfixKeyReadyGate,
  hotfixUnifiedPoll, hotfixForceUpdateTaskRetarget, hotfixUsbWhitelistNoise
} from './hotfix/feature-additions.ts';

/**
 * Aplica hotfixes criticos de compatibilidade no script Windows do agente.
 * Mantem comportamento idempotente (nao reaplica quando ja existe marcador HOTFIX).
 */
export function applyWindowsScriptHotfix(script: string): WindowsScriptHotfixResult {
  const ctx: HotfixContext = { content: script, reasons: [] };

  // 1. StrictMode globals (must be first)
  hotfixStrictModeGlobals(ctx);
  hotfixBaselineGlobals(ctx);
  hotfixInitProtectedSet(ctx);
  hotfixRsaGlobalsInit(ctx);

  // 2. Crypto fallbacks
  hotfixLegacyEcdsaFallback(ctx);
  hotfixExportPkcs8RsaFallback(ctx);
  hotfixCngCleanup(ctx);
  hotfixRsa2048Fallback(ctx);
  hotfixRsaSignFallback(ctx);
  hotfixRsaAlgoReport(ctx);
  hotfixRsaNet4x(ctx);
  hotfixRngNet4x(ctx);
  hotfixNullEcdsaGuard(ctx);
  hotfixEcdsaRsaAutoregen(ctx);
  hotfixNullPrivkeyRegen(ctx);
  hotfixOrphanBraceCleanup(ctx);

  // 3. Safe property access
  hotfixSafeAnomaliesAccess(ctx);
  hotfixSafeForceUpdate(ctx);
  hotfixSafeRepairedAndSha256(ctx);
  hotfixSafeRegisteredAt(ctx);
  hotfixSafeEcdsaSig(ctx);
  hotfixSafeCacheSig(ctx);

  // 4. Pipeline & type safety
  hotfixPipelineSafeTestCalls(ctx);
  hotfixTypesafeStatus(ctx);
  hotfixLocalDetectTryCatch(ctx);
  hotfixUsbCount(ctx);
  hotfixSoftwareCount(ctx);
  hotfixVersionPrefix(ctx);
  hotfixBodyCompress(ctx);

  // 5. TOCTOU integrity
  hotfixToctouSelfheal(ctx);
  hotfixPreloggerRepair(ctx);
  hotfixToctouRuntimeSelfheal(ctx);
  hotfixHeartbeatSha256Sync(ctx);
  hotfixToctouDualHash(ctx);

  // 6. Firewall skip
  hotfixSkipFwBoot(ctx);
  hotfixSkipFwPersist(ctx);
  hotfixSkipFwHeartbeatRead(ctx);
  hotfixUpgradeFlagPath(ctx);
  hotfixUpgradeGuardFileCheck(ctx);
  hotfixSkipFwGuard(ctx);
  hotfixSkipFwInit(ctx);

  // 7. Feature additions
  hotfixFailopenUnsigned(ctx);
  hotfixFailopenSig(ctx);
  hotfixAclSid(ctx);
  hotfixCollectCerts(ctx);
  hotfixCollectDisk(ctx);
  hotfixDns403Info(ctx);
  hotfixBaselineDedup(ctx);
  hotfixBaselineLoadSafe(ctx);
  hotfixBaselineNormalizeSave(ctx);
  hotfixRegistrySnapshot(ctx);
  hotfixMultiBrowser(ctx);
  hotfixKeyReadyGate(ctx);
  hotfixUnifiedPoll(ctx);
  hotfixForceUpdateTaskRetarget(ctx);
  hotfixUsbWhitelistNoise(ctx);

  return { content: ctx.content, changed: ctx.reasons.length > 0, reasons: ctx.reasons };
}
