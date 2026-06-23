import { bolaRule, frontendOnlyValidationRule } from './accessControl.js'
import { jwtRule } from './auth.js'
import {
  electronMisconfigRule,
  gitignoreRule,
  insecureConfigRule,
  insecureCookieRule,
  securityHeadersRule
} from './config.js'
import { weakCryptoRule, weakRandomRule } from './crypto.js'
import { dataflowRules } from './dataflow.js'
import { deserializationRule } from './deserialization.js'
import { electronHardeningRule } from './electron.js'
import { ipcPreloadExposureRule, ipcValidationRule } from './ipc.js'
import { commandInjectionRule, dangerousSinkRule, nosqlInjectionRule, sqlInjectionRule } from './injection.js'
import { sensitiveLoggingRule } from './logging.js'
import { clientSecretRule, hardcodedSecretRule, supabaseRlsRule } from './secrets.js'
import { supplyChainRule } from './supplyChain.js'
import type { Rule } from './types.js'

/**
 * The complete rule set, in a stable order. The runner sorts findings by severity afterwards, so
 * this order only affects ties; it is grouped by theme for readability and easy auditing.
 */
export const ALL_RULES: Rule[] = [
  // Secrets
  clientSecretRule,
  hardcodedSecretRule,
  supabaseRlsRule,
  // Injection / dangerous sinks
  dangerousSinkRule,
  sqlInjectionRule,
  commandInjectionRule,
  nosqlInjectionRule,
  deserializationRule,
  // Data-flow (SSRF, traversal, redirect, prototype pollution, mass assignment, ReDoS)
  ...dataflowRules,
  // Access control / validation
  bolaRule,
  frontendOnlyValidationRule,
  ipcValidationRule,
  ipcPreloadExposureRule,
  // Auth / crypto
  jwtRule,
  weakRandomRule,
  weakCryptoRule,
  // Logging / data exposure
  sensitiveLoggingRule,
  // Config / platform
  insecureConfigRule,
  insecureCookieRule,
  securityHeadersRule,
  electronMisconfigRule,
  electronHardeningRule,
  gitignoreRule,
  // Supply chain
  supplyChainRule
]
