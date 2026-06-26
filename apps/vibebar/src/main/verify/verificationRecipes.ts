import type { PackageManager, ProjectProfile } from '@vibebar/project-detector'
import type { VerificationRecipe, VerificationStep } from '@shared/types.js'

export type { VerificationRecipe, VerificationStep }

const VERIFY_SCRIPT_ORDER = ['typecheck', 'test', 'lint', 'build'] as const

const PM_RUN: Record<PackageManager | 'unknown', (script: string) => string> = {
  npm: (s) => `npm run ${s}`,
  pnpm: (s) => `pnpm run ${s}`,
  yarn: (s) => `yarn ${s}`,
  unknown: (s) => `npm run ${s}`
}

const STEP_LABEL: Record<string, string> = {
  typecheck: 'Type-check',
  test: 'Run tests',
  lint: 'Lint',
  build: 'Build'
}

function runCommand(profile: ProjectProfile, script: string): string {
  const fn = PM_RUN[profile.packageManager] ?? PM_RUN.npm
  return fn(script)
}

/** Builds an ordered verify plan from package.json scripts and project profile. */
export function buildVerificationRecipe(profile: ProjectProfile | null): VerificationRecipe | null {
  if (!profile) return null

  const scriptSet = new Set(profile.scripts ?? [])
  const steps: VerificationStep[] = []

  for (const name of VERIFY_SCRIPT_ORDER) {
    if (!scriptSet.has(name)) continue
    steps.push({
      id: name,
      label: STEP_LABEL[name] ?? name,
      command: runCommand(profile, name)
    })
  }

  if (steps.length === 0) return null

  return {
    steps,
    summary: steps.map((s) => s.command).join(' → ')
  }
}

/** Best single verify command for Fix with Context / intent defaults. */
export function primaryVerifyFromRecipe(recipe: VerificationRecipe | null): string | null {
  if (!recipe || recipe.steps.length === 0) return null
  const test = recipe.steps.find((s) => s.id === 'test')
  if (test) return test.command
  const typecheck = recipe.steps.find((s) => s.id === 'typecheck')
  if (typecheck) return typecheck.command
  return recipe.steps[0]?.command ?? null
}
