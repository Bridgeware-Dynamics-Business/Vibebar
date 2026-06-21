import type { PromptTemplate } from '@vibebar/prompt-engine'

/** Web-stack prompts (Next.js, React, Vue, Svelte) with browser security guardrails. */
export const WEB_PROMPTS: PromptTemplate[] = [
  {
    id: 'web-xss-audit',
    title: 'Audit for XSS and unsafe HTML',
    categories: ['Security'],
    stacks: ['next', 'react', 'vue', 'svelte'],
    description: 'Finds DOM injection sinks and traces whether untrusted data reaches them.',
    variables: [],
    guardrails: ['no-innerHTML', 'no-secrets'],
    builtIn: true,
    body: [
      'Audit my {{framework}} app for cross-site scripting (XSS — OWASP A03 injection). Do not just grep for keywords; for each sink, trace whether the data flowing into it can be influenced by a user (props, URL/query params, form input, API responses, stored content).',
      '',
      'Find and classify every dangerous sink:',
      '- `dangerouslySetInnerHTML`{{#if isVue}}, `v-html`{{/if}}{{#if isSvelte}}, `{@html ...}`{{/if}}, `innerHTML`/`outerHTML`, `document.write`.',
      '- `eval`, `new Function`, and `setTimeout`/`setInterval` called with a string.',
      '- URLs/attributes built from user input (`href`, `src`, `srcdoc`, `javascript:` schemes), and `window.location`/`postMessage` handlers.',
      '',
      'For each finding report: the file/line, whether the source is trusted or attacker-influenced, and the severity. Then give the fix: prefer rendering as text / framework binding; if HTML is truly required, sanitize with a vetted library (e.g. DOMPurify) at the point of insertion. Recommend a concrete Content-Security-Policy{{#if isNext}} (and where to set it in Next.js — headers in `next.config` or middleware){{/if}} as defense in depth. Show before/after for the riskiest spots and name the exact attack each fix blocks.'
    ].join('\n')
  },
  {
    id: 'web-env-secrets',
    title: 'Fix environment and secrets handling',
    categories: ['Security', 'Deploy'],
    stacks: ['next', 'react', 'vue', 'svelte'],
    description: 'Ensures secrets stay server-side and only intended values reach the client bundle.',
    variables: [],
    guardrails: ['no-secrets'],
    builtIn: true,
    body: [
      'Review how my {{framework}} app handles environment variables and secrets. The core rule: anything bundled for the browser is public, so a server secret must never appear in client code.',
      '',
      'Inspect and report:',
      '- Every env var exposed to the client via a public prefix (NEXT_PUBLIC_/VITE_/REACT_APP_/EXPO_PUBLIC_) and whether each one is genuinely safe to be public.',
      '- Any secret (API key, token, DB URL, private key) referenced from a file that ships to the browser.',
      '- Whether `.env`, `.env.local`, and friends are gitignored, and whether any are committed.',
      '{{#if isNext}}- That server-only secrets are read in Server Components, Route Handlers, server actions, or middleware — never in a "use client" component — and are not accidentally prefixed for client exposure.{{/if}}',
      '',
      'Output: a table [Variable | Where used | Exposed to client? | Verdict | Fix]. For every leak, tell me how to move the value server-side, that the leaked value must be rotated, and how to expose only the safe public subset to the browser. Refer to secrets by name/location — never echo their values.'
    ].join('\n')
  },
  {
    id: 'web-accessibility',
    title: 'Accessibility and responsive pass',
    categories: ['UI/UX'],
    stacks: ['next', 'react', 'vue', 'svelte'],
    description: 'Improves keyboard access, semantics, contrast, and responsive layout to WCAG AA.',
    variables: [],
    guardrails: [],
    builtIn: true,
    body: [
      'Do an accessibility and responsive review of my {{framework}} UI, targeting WCAG 2.1 AA. Review the actual components, not a generic checklist.',
      '',
      'Check and report concrete issues for:',
      '- **Semantics** — correct landmark/heading structure, native elements over `div`+click, lists/tables used properly.',
      '- **Keyboard** — every interactive element is reachable and operable by keyboard, focus order is logical, focus is visible, and focus is trapped/restored in modals and menus.',
      '- **Screen readers** — labels for inputs and icon-only buttons, `alt` text, and ARIA used only where native semantics fall short (no redundant or broken ARIA).',
      '- **Contrast & motion** — text/UI contrast meets AA, and motion respects `prefers-reduced-motion`.',
      '- **Responsive** — layout holds from ~320px up, no horizontal scroll, tap targets are large enough, and content reflows rather than truncating.',
      '',
      'Output a prioritized list: [Component/file | Issue | WCAG criterion | Fix]. Give the specific code change for the top items, and flag anything that needs a manual screen-reader/keyboard test I should run myself.'
    ].join('\n')
  }
]
