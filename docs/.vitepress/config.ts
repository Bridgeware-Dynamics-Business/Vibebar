import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'vibebar::',
  description:
    'Documentation for vibebar:: — the floating Windows companion for vibe coding with Cursor and other AI assistants.',
  base: '/Vibebar/',
  head: [['link', { rel: 'icon', href: '/Vibebar/favicon.svg' }]],
  themeConfig: {
    logo: { text: 'vibebar::' },
    nav: [
      { text: 'Guide', link: '/guide/getting-started', activeMatch: '/guide/' },
      { text: 'Features', link: '/features/', activeMatch: '/features/' },
      { text: 'Workflows', link: '/workflows/real-world-workflows', activeMatch: '/workflows/' },
      { text: 'Reference', link: '/reference/hotkeys', activeMatch: '/reference/' },
      { text: 'Help', link: '/help/troubleshooting', activeMatch: '/help/' },
      {
        text: 'Download',
        link: 'https://github.com/Bridgeware-Dynamics-Business/Vibebar/releases'
      }
    ],
    sidebar: {
      '/guide/': [
        {
          text: 'Introduction',
          items: [
            { text: 'What is VibeBar?', link: '/guide/what-is-vibebar' },
            { text: 'Install & setup', link: '/guide/getting-started' },
            { text: 'Your first session', link: '/guide/first-session' }
          ]
        }
      ],
      '/features/': [
        {
          text: 'Overview',
          items: [{ text: 'Toolbar & tools', link: '/features/' }]
        },
        {
          text: 'Tools',
          items: [
            { text: 'Prompt Library', link: '/features/prompt-library' },
            { text: 'Security Audit', link: '/features/security-audit' },
            { text: 'Ready Check', link: '/features/ready-check' },
            { text: 'Session Hub', link: '/features/session-hub' },
            { text: 'Context Packer', link: '/features/context-packer' },
            { text: 'Smart Terminal', link: '/features/smart-terminal' },
            { text: 'Notes', link: '/features/notes' },
            { text: 'Code Sync', link: '/features/code-sync' },
            { text: 'Snip to AI Context', link: '/features/snip-to-ai-context' },
            { text: 'Command palette', link: '/features/command-palette' }
          ]
        },
        {
          text: 'Cursor Agent',
          items: [
            { text: 'MCP server', link: '/features/mcp-server' },
            { text: 'Fix With Context', link: '/features/fix-with-context' }
          ]
        }
      ],
      '/workflows/': [
        {
          text: 'Workflows',
          items: [{ text: 'Everyday patterns', link: '/workflows/real-world-workflows' }]
        }
      ],
      '/reference/': [
        {
          text: 'Reference',
          items: [
            { text: 'Keyboard shortcuts', link: '/reference/hotkeys' },
            { text: 'Settings', link: '/reference/settings' },
            { text: 'Files & storage', link: '/reference/files-and-storage' }
          ]
        }
      ],
      '/philosophy/': [
        {
          text: 'Background',
          items: [{ text: 'Why VibeBar exists', link: '/philosophy/whats-different' }]
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
    siteTitle: 'vibebar:: Docs',
    editLink: {
      pattern:
        'https://github.com/Bridgeware-Dynamics-Business/Vibebar/edit/main/docs/:path',
      text: 'Edit this page on GitHub'
    },
    footer: {
      message: 'vibebar:: by Bridgeware Dynamics Business',
      copyright: 'Copyright © 2026 Bridgeware Dynamics Business · v1.1.0'
    },
    search: {
      provider: 'local'
    },
    outline: {
      level: [2, 3]
    }
  }
})
