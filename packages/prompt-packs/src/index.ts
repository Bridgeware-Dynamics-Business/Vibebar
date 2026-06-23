import type { PromptTemplate } from '@vibebar/prompt-engine'
import { COMMON_PROMPTS } from './common.js'
import { ELECTRON_PROMPTS } from './electron.js'
import { PYTHON_PROMPTS } from './python.js'
import { SECURITY_PROMPTS } from './security.js'
import { WEB_PROMPTS } from './web.js'
import { WORKFLOW_PROMPTS } from './workflow.js'

export { COMMON_PROMPTS, ELECTRON_PROMPTS, PYTHON_PROMPTS, SECURITY_PROMPTS, WEB_PROMPTS, WORKFLOW_PROMPTS }

/** All built-in prompts across every starter pack, ready to seed the prompt store. */
export function getBuiltInPrompts(): PromptTemplate[] {
  return [
    ...COMMON_PROMPTS,
    ...WORKFLOW_PROMPTS,
    ...SECURITY_PROMPTS,
    ...ELECTRON_PROMPTS,
    ...WEB_PROMPTS,
    ...PYTHON_PROMPTS
  ]
}
