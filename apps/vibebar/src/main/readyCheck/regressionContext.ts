import type { ProjectProfile } from '@vibebar/project-detector'
import { packMvcContext, stackPathsFromProfile } from '../packer/mvcPacker.js'
import { parseStructuredOutput } from '../terminal/terminalParsers.js'
import type { CommandResult } from '../terminal/TerminalSession.js'
import { resolvePackCharBudget } from '../mcp/constants.js'

export interface RegressionContextDeps {
  rootPath: string
  profile: ProjectProfile
  filesChangedSince: string[]
  changedFiles: () => Promise<string[]>
  ignoreText: string
  lastFailedResult: CommandResult | null
}

export interface RegressionContextResult {
  text: string
  fileCount: number
  usedChars: number
}

/** MVC pack for files changed since last-green verify (shared by MCP + Ready Check IPC). */
export async function buildRegressionContext(
  deps: RegressionContextDeps,
  maxTokens?: number
): Promise<RegressionContextResult | { empty: true; message: string }> {
  let paths = deps.filesChangedSince
  if (paths.length === 0) {
    paths = await deps.changedFiles()
    if (paths.length === 0) {
      return { empty: true, message: 'No files changed since last green (working tree clean).' }
    }
  }

  const structured =
    deps.lastFailedResult && deps.profile
      ? parseStructuredOutput(
          {
            command: deps.lastFailedResult.command,
            output: deps.lastFailedResult.output,
            exitCode: deps.lastFailedResult.exitCode,
            profile: deps.profile
          },
          deps.profile
        )
      : null
  const stackPaths = stackPathsFromProfile(deps.rootPath, structured?.stackFrames ?? [])

  const charBudget = resolvePackCharBudget(maxTokens)
  const packed = await packMvcContext({
    rootPath: deps.rootPath,
    headerLabel: deps.profile.folderName || 'project',
    seedPaths: [...new Set([...paths, ...stackPaths])],
    ignoreText: deps.ignoreText,
    charBudget
  })

  if (packed.fileCount === 0) {
    return { empty: true, message: 'No regression context files to pack.' }
  }

  const header = `# Regression context (${packed.fileCount} files, ${packed.usedChars} chars)\n\nFiles changed since last green verify.\n\n`
  return {
    text: `${header}${packed.text}`,
    fileCount: packed.fileCount,
    usedChars: packed.usedChars
  }
}

export function formatRegressionContextPrompt(text: string): string {
  return [
    '# VibeBar — regression context',
    '',
    'Use this MVC bundle to investigate regressions after files changed since last green verify.',
    '',
    text.trim(),
    ''
  ].join('\n')
}
