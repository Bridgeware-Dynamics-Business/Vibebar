import { describe, expect, it } from 'vitest'
import type { ProjectProfile } from '@vibebar/project-detector'
import {
  buildVerificationRecipe,
  primaryVerifyFromRecipe
} from './verificationRecipes.js'

function profile(scripts: string[]): ProjectProfile {
  return {
    rootPath: '/repo',
    folderName: 'repo',
    language: 'typescript',
    framework: 'electron',
    packageManager: 'npm',
    hasRootManifest: true,
    hasAiContextFolder: false,
    scripts
  } as ProjectProfile
}

describe('buildVerificationRecipe', () => {
  it('orders typecheck, test, lint, build when present', () => {
    const recipe = buildVerificationRecipe(profile(['build', 'lint', 'test', 'typecheck', 'dev']))
    expect(recipe?.steps.map((s) => s.id)).toEqual(['typecheck', 'test', 'lint', 'build'])
    expect(recipe?.summary).toContain('npm run typecheck')
    expect(recipe?.summary).toContain('npm run test')
  })

  it('returns null when no verify scripts exist', () => {
    expect(buildVerificationRecipe(profile(['dev']))).toBeNull()
    expect(buildVerificationRecipe(null)).toBeNull()
  })
})

describe('primaryVerifyFromRecipe', () => {
  it('prefers test over typecheck', () => {
    const recipe = buildVerificationRecipe(profile(['typecheck', 'test']))
    expect(primaryVerifyFromRecipe(recipe)).toBe('npm run test')
  })

  it('falls back to typecheck when test missing', () => {
    const recipe = buildVerificationRecipe(profile(['typecheck', 'lint']))
    expect(primaryVerifyFromRecipe(recipe)).toBe('npm run typecheck')
  })
})
