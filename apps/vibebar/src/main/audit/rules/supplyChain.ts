import type { AuditFinding } from '@shared/types.js'
import { metaFinding } from '../engine/prompts.js'
import type { ProjectRule } from './types.js'

/** Supply-chain hygiene: unpinned ranges and missing lockfile (silent compromised-update risk). */
export const supplyChainRule: ProjectRule = {
  id: 'supply-chain',
  category: 'Supply Chain',
  scope: 'project',
  run({ input }) {
    const pkg = input.packageJson
    if (!pkg) return []
    const findings: AuditFinding[] = []

    const unpinnedOf = (deps: Record<string, unknown> | undefined): string[] =>
      Object.entries(deps ?? {})
        .filter(([, v]) => typeof v === 'string' && !v.startsWith('workspace:') && /^[\^~]|[*x]|latest|>=|</.test(v))
        .map(([k, v]) => `${k}@${String(v)}`)

    const prodUnpinned = unpinnedOf(pkg.dependencies as Record<string, unknown> | undefined)
    const devUnpinned = unpinnedOf(pkg.devDependencies as Record<string, unknown> | undefined)

    const unpinned = input.hasLockfile ? prodUnpinned : [...prodUnpinned, ...devUnpinned]
    const severity: AuditFinding['severity'] = input.hasLockfile ? 'low' : 'medium'
    const detail = input.hasLockfile
      ? 'Production dependencies use version ranges. A committed lockfile pins the versions installed today, but a fresh install (or `npm update`) can still pull a different in-range version, including a compromised or breaking one.'
      : 'Version ranges let a compromised or breaking update enter without any code change on your side, and with no lockfile every install can resolve differently. AI tools tend to leave versions unpinned.'

    if (unpinned.length > 0) {
      findings.push(
        metaFinding({
          input,
          id: 'unpinned-deps',
          category: 'Supply Chain',
          severity,
          confidence: 'high',
          remediationEffort: 'trivial',
          cwe: 'CWE-1104 — Use of Unmaintained Third Party Components',
          references: ['OWASP A06:2021 — Vulnerable and Outdated Components'],
          title: `${unpinned.length} unpinned ${input.hasLockfile ? 'production ' : ''}dependenc${unpinned.length === 1 ? 'y' : 'ies'}`,
          detail,
          evidence: unpinned.slice(0, 12).join('\n'),
          fix: {
            task: 'Pin unpinned dependency versions and lock the dependency tree',
            where: `These dependencies use range specifiers:\n${unpinned.slice(0, 30).join('\n')}`,
            problem:
              'Caret/tilde/star/latest ranges let a compromised or breaking update enter on the next install with no code change on your side. This is a primary supply-chain attack vector.',
            goal: 'Make installs deterministic by pinning to known-good versions and committing a lockfile.',
            steps: [
              'Pin each listed dependency to the version currently installed — do NOT blindly upgrade.',
              'Generate and commit the lockfile for my package manager.',
              'Explain briefly why exact pins + a committed lockfile reduce supply-chain risk.'
            ]
          },
          test: {
            objective: 'Prevent unpinned production dependencies from re-entering the project.',
            steps: [
              'Add a CI check that fails if package.json contains range specifiers (^, ~, *, latest) for production dependencies.',
              'Add a CI check that fails if the lockfile is out of sync with package.json.'
            ]
          }
        })
      )
    }

    if (!input.hasLockfile) {
      findings.push(
        metaFinding({
          input,
          id: 'missing-lockfile',
          category: 'Supply Chain',
          severity: 'high',
          confidence: 'high',
          remediationEffort: 'trivial',
          cwe: 'CWE-1104 — Use of Unmaintained Third Party Components',
          references: ['OWASP A06:2021 — Vulnerable and Outdated Components'],
          title: 'No lockfile committed',
          detail:
            'Without a lockfile, installs are non-deterministic and a compromised transitive update can slip in silently.',
          fix: {
            task: 'Generate and commit a lockfile',
            where: 'Project root (no package-lock.json / pnpm-lock.yaml / yarn.lock / bun.lockb found).',
            problem:
              'With no lockfile, every install can resolve different transitive versions, so a compromised update can slip in silently and the build is not reproducible.',
            goal: 'Make dependency resolution deterministic and reproducible.',
            steps: [
              'Tell me which lockfile my package manager should produce and the exact command to generate it.',
              'Confirm the lockfile must be committed and never gitignored.',
              'Confirm CI should install with a frozen lockfile.'
            ]
          },
          test: {
            objective: 'Guarantee installs are reproducible and fail on dependency drift.',
            steps: [
              'Add a CI step that runs a clean, frozen-lockfile install (e.g. npm ci / pnpm install --frozen-lockfile / yarn --immutable).',
              'Assert the build fails if the lockfile is missing or out of sync.'
            ]
          }
        })
      )
    }

    return findings
  }
}
