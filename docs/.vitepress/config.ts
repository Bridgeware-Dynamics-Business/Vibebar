import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'VibeBar',
  description: 'Floating Windows companion for vibe coding with AI assistants like Cursor.',
  base: '/Vibebar/',
  head: [['link', { rel: 'icon', href: '/Vibebar/favicon.svg' }]],
  themeConfig: {
    logo: { text: 'VibeBar' },
    nav: [
      { text: 'Guide', link: '/guide/getting-started', activeMatch: '/guide/' },
      { text: 'Features', link: '/features/', activeMatch: '/features/' },
      { text: 'Workflows', link: '/workflows/real-world-workflows', activeMatch: '/workflows/' },
      { text: 'Reference', link: '/reference/hotkeys', activeMatch: '/reference/' },
      { text: 'Contribute', link: '/contribute/contributing', activeMatch: '/contribute/' },
      { text: 'GitHub', link: 'https://github.com/Bridgeware-Dynamics-Business/Vibebar' }
    ],
    sidebar: {
      '/guide/': [
        {
          text: 'Getting started',
          items: [
            { text: 'Installation & setup', link: '/guide/getting-started' },
            { text: 'Your first session', link: '/guide/first-session' }
          ]
        }
      ],
      '/features/': [
        {
          text: 'Overview',
          items: [{ text: 'Feature map', link: '/features/' }]
        },
        {
          text: 'Core tools',
          items: [
            { text: 'Prompt Library', link: '/features/prompt-library' },
            { text: 'Security Audit', link: '/features/security-audit' },
            { text: 'Session Hub', link: '/features/session-hub' },
            { text: 'Context Packer', link: '/features/context-packer' },
            { text: 'Smart Terminal', link: '/features/smart-terminal' },
            { text: 'Notes', link: '/features/notes' },
            { text: 'Code Sync', link: '/features/code-sync' },
            { text: 'Snip to AI Context', link: '/features/snip-to-ai-context' },
            { text: 'Command palette', link: '/features/command-palette' }
          ]
        }
      ],
      '/workflows/': [
        {
          text: 'Workflows',
          items: [{ text: 'Real-world workflows', link: '/workflows/real-world-workflows' }]
        }
      ],
      '/reference/': [
        {
          text: 'Reference',
          items: [
            { text: 'Keyboard shortcuts', link: '/reference/hotkeys' },
            { text: 'Settings', link: '/reference/settings' }
          ]
        }
      ],
      '/philosophy/': [
        {
          text: 'Philosophy',
          items: [{ text: 'What makes VibeBar different', link: '/philosophy/whats-different' }]
        }
      ],
      '/contribute/': [
        {
          text: 'Contributing',
          items: [{ text: 'How to contribute', link: '/contribute/contributing' }]
        }
      ],
      '/help/': [
        {
          text: 'Help',
          items: [{ text: 'Troubleshooting', link: '/help/troubleshooting' }]
        }
      ]
    },
    socialLinks: [
      { icon: 'github', link: 'https://github.com/Bridgeware-Dynamics-Business/Vibebar' }
    ],
    editLink: {
      pattern:
        'https://github.com/Bridgeware-Dynamics-Business/Vibebar/edit/main/docs/:path',
      text: 'Edit this page on GitHub'
    },
    footer: {
      message: 'Built by Bridgeware Dynamics Business',
      copyright: 'Copyright © 2026 Bridgeware Dynamics Business'
    },
    search: {
      provider: 'local'
    }
  }
})
