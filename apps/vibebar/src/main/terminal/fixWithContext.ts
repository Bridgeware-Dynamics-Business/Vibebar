import { buildContext } from '@vibebar/prompt-engine'
import type { ProjectProfile } from '@vibebar/project-detector'
import { buildContextHealthWarnings } from '@shared/contextHealth.js'
import { resolveContextPackBudget } from '@shared/contextPackTier.js'
import type { DetectedIssue, IntentContract, ProjectCommand } from '@shared/types.js'
import type { ProjectService } from '../project/ProjectService.js'
import type { AppStore } from '../settings/store.js'
import {
  findRelatedTests,
  nearestTestFile,
  packMvcContext,
  stackPathsFromProfile
} from '../packer/mvcPacker.js'
import { SAFETY_FOOTER } from './outputAnalyzer.js'
import type { CommandResult } from './TerminalSession.js'
import { parseStructuredOutput } from './terminalParsers.js'
import { generateProjectCommands } from './projectCommands.js'
import { formatIntentSection } from '../session/intentContract.js'
import {
  buildVerificationRecipe,
  primaryVerifyFromRecipe
} from '../verify/verificationRecipes.js'

export interface FixWithContextInput {
  result: CommandResult
  profile: ProjectProfile | null
  issue?: DetectedIssue | null
  ignoreText?: string
  agentsMd?: string | null
  intent?: IntentContract | null
}

export interface FixWithContextBundle {
  text: string
  verifyCommand: string | null
  fileCount: number
}

function headerLabel(profile: ProjectProfile | null): string {
  if (!profile) return 'project'
  const ctx = buildContext(profile)
  const parts = [ctx.framework, ctx.language].filter((x) => x && x !== 'unknown')
  return parts.length ? `${profile.folderName} (${parts.join(' · ')})` : profile.folderName
}

function projectSummary(profile: ProjectProfile | null): string {
  if (!profile) return 'Unknown project stack.'
  const ctx = buildContext(profile)
  return [
    `- Language: ${ctx.language}`,
    `- Framework: ${ctx.framework}`,
    `- Test runner: ${ctx.testRunner}`,
    `- Package manager: ${profile.packageManager === 'unknown' ? 'npm' : profile.packageManager}`
  ].join('\n')
}

/** Picks the best verify command from project scripts/detected commands. */
export function suggestVerifyCommand(
  commands: ProjectCommand[],
  failureKind: string | null
): string | null {
  const prefer =
    failureKind === 'tsc'
      ? ['typecheck', 'build']
      : failureKind === 'vitest' || failureKind === 'jest' || failureKind === 'test-failure'
        ? ['test']
        : ['test', 'typecheck', 'build']

  for (const id of prefer) {
    const match = commands.find((c) => c.id === `script:${id}` || c.id === `detected:${id}`)
    if (match) return match.command
  }
  const scriptTest = commands.find((c) => c.group === 'Scripts' && /test|lint|typecheck|build/i.test(c.label))
  return scriptTest?.command ?? commands[0]?.command ?? null
}

function fence(text: string): string {
  return ['```', text, '```'].join('\n')
}

/**
 * Auto-packages command failure + MVC context + stack + verify hint into one clipboard bundle.
 */
export async function buildFixWithContextBundle(input: FixWithContextInput): Promise<FixWithContextBundle> {
  const { result, profile, issue } = input
  const structured = parseStructuredOutput(
    { command: result.command, output: result.output, exitCode: result.exitCode, profile },
    profile
  )
  const failureKind = structured?.primaryKind ?? issue?.id ?? null
  const stackPaths = profile
    ? stackPathsFromProfile(profile.rootPath, structured?.stackFrames ?? [])
    : []
  const seedPaths = [...new Set([...(issue?.relatedFiles ?? []), ...stackPaths])]

  let mvcText = ''
  let fileCount = 0
  let packedPaths: string[] = []
  if (profile?.rootPath) {
    const { tier, budget } = resolveContextPackBudget('standard')
    const mvc = await packMvcContext({
      rootPath: profile.rootPath,
      headerLabel: headerLabel(profile),
      seedPaths,
      ignoreText: input.ignoreText,
      charBudget: budget,
      tier
    })
    mvcText = mvc.text
    fileCount = mvc.fileCount
    packedPaths = mvc.paths
  }

  const commands = await generateProjectCommands(profile)
  const recipe = buildVerificationRecipe(profile)
  const verifyCommand =
    suggestVerifyCommand(commands, failureKind) ?? primaryVerifyFromRecipe(recipe)

  const testPaths =
    profile?.rootPath && seedPaths.length > 0
      ? await findRelatedTests(profile.rootPath, seedPaths, input.ignoreText ?? '')
      : []
  const nearestTest = nearestTestFile(testPaths, seedPaths)

  const evidence = issue?.evidence ?? structured?.evidence ?? result.output.slice(-4000).trim()
  const healthWarnings = buildContextHealthWarnings({
    profile,
    agentsMd: input.agentsMd,
    packCharCount: mvcText.length,
    selectedPaths: packedPaths
  })

  const lines: string[] = []

  lines.push(...formatIntentSection(input.intent))

  lines.push(
    '## Fix with context',
    '',
    `Command: \`${result.command.trim()}\`${result.exitCode != null ? ` (exit ${result.exitCode})` : ''}`,
    '',
    '### Failure output',
    fence(evidence.slice(0, 8000)),
    '',
    '### Project stack',
    projectSummary(profile),
    ''
  )

  if (nearestTest) {
    lines.push('### Nearest test file', `- \`${nearestTest}\``, '')
  }

  if (verifyCommand) {
    lines.push('### Suggested verify command', `\`${verifyCommand}\``, '')
  }

  if (healthWarnings.length > 0) {
    lines.push('### Context health', ...healthWarnings.map((w) => `- ${w.message}`), '')
  }

  if (mvcText.trim()) {
    lines.push('### Minimum viable context (changed + imports + tests)', '', mvcText.trim(), '')
  }

  lines.push(
    '### Task',
    issue?.prompt
      ? issue.prompt.split('\n').slice(4).join('\n').trim() || issue.prompt
      : 'Explain the failure, apply the minimal fix, and tell me how to verify.',
    '',
    SAFETY_FOOTER
  )

  return {
    text: lines.join('\n').trimEnd() + '\n',
    verifyCommand,
    fileCount
  }
}

export interface FixWithContextDeps {
  store: AppStore
  projects: ProjectService
}

export async function runFixWithContext(
  deps: FixWithContextDeps,
  result: CommandResult,
  issue?: DetectedIssue | null,
  intent?: IntentContract | null
): Promise<FixWithContextBundle> {
  const profile = deps.projects.getProfile()
  const agents = profile ? await deps.projects.getAiDocs() : null
  return buildFixWithContextBundle({
    result,
    profile,
    issue,
    ignoreText: deps.store.getCodeSyncConfig().ignoreText,
    agentsMd: agents?.agentsMd ?? null,
    intent: intent ?? null
  })
}
