/**
 * Feature additions hotfixes - Re-export barrel for backward compatibility.
 * Individual hotfixes are now in dedicated files under hotfix/feature-*.ts
 */
import type { HotfixContext } from './types.ts';

// Fail-open
export { hotfixFailopenUnsigned, hotfixFailopenSig } from './feature-failopen.ts';

// ACL, certs, disk, DNS
export { hotfixAclSid, hotfixCollectCerts, hotfixCollectDisk, hotfixDns403Info } from './feature-acl-certs-disk.ts';

// Baseline & registry
export { hotfixBaselineDedup, hotfixBaselineLoadSafe, hotfixBaselineNormalizeSave, hotfixRegistrySnapshot } from './feature-baseline.ts';

// Browser, key, poll, task retarget, USB
export { hotfixMultiBrowser, hotfixKeyReadyGate, hotfixUnifiedPoll, hotfixForceUpdateTaskRetarget, hotfixUsbWhitelistNoise } from './feature-browser-key-poll-task-usb.ts';
