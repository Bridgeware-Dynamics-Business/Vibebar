import { describe, expect, it } from 'vitest'
import { type AuditContext, type AuditRuleInput, runAuditRules } from './auditRules.js'

const ctx: AuditContext = {
  label: 'my Next.js project (TypeScript)',
  framework: 'Next.js',
  language: 'TypeScript',
  testRunner: 'Playwright'
}

const electronCtx: AuditContext = {
  label: 'my Electron project (TypeScript)',
  framework: 'Electron',
  language: 'TypeScript',
  testRunner: 'Vitest'
}

const serverPkg = { dependencies: { express: '^4.19.0' } }

function input(partial: Partial<AuditRuleInput>): AuditRuleInput {
  return { ctx, files: [], packageJson: serverPkg, hasLockfile: true, ...partial }
}

function has(findings: { id: string }[], ruleId: string): boolean {
  return findings.some((f) => f.id === ruleId || f.id.startsWith(`${ruleId}-`))
}

describe('new detectors — SSRF', () => {
  it('flags a fetch to a tainted URL with high confidence', () => {
    const f = runAuditRules(
      input({
        files: [{ path: 'src/api/proxy.ts', content: 'function h(req, res){ return fetch(req.query.url) }' }]
      })
    )
    const ssrf = f.find((x) => x.id.startsWith('ssrf'))
    expect(ssrf).toBeDefined()
    expect(ssrf?.confidence).toBe('high')
  })

  it('does not flag a fetch to a constant URL', () => {
    const f = runAuditRules(
      input({
        files: [{ path: 'src/api/proxy.ts', content: "function h(req, res){ return fetch('https://api.example.com/data') }" }]
      })
    )
    expect(has(f, 'ssrf')).toBe(false)
  })
})

describe('new detectors — path traversal', () => {
  it('flags fs.readFile with a tainted path', () => {
    const f = runAuditRules(
      input({
        files: [{ path: 'src/api/file.ts', content: "import fs from 'fs'\nfunction h(req, res){ fs.readFile(req.query.path, cb) }" }]
      })
    )
    expect(has(f, 'path-traversal')).toBe(true)
  })

  it('does not flag fs.readFile with a constant path', () => {
    const f = runAuditRules(
      input({
        files: [{ path: 'src/api/file.ts', content: "import fs from 'fs'\nfs.readFile('./config.json', cb)" }]
      })
    )
    expect(has(f, 'path-traversal')).toBe(false)
  })
})

describe('new detectors — weak crypto', () => {
  it('flags createHash("md5")', () => {
    const f = runAuditRules(
      input({ files: [{ path: 'src/util.ts', content: "import crypto from 'crypto'\nconst h = crypto.createHash('md5')" }] })
    )
    expect(has(f, 'weak-crypto')).toBe(true)
  })

  it('does not flag createHash("sha256")', () => {
    const f = runAuditRules(
      input({ files: [{ path: 'src/util.ts', content: "import crypto from 'crypto'\nconst h = crypto.createHash('sha256')" }] })
    )
    expect(has(f, 'weak-crypto')).toBe(false)
  })

  it('flags a real createCipher call', () => {
    const f = runAuditRules(
      input({ files: [{ path: 'src/util.ts', content: "import crypto from 'crypto'\nconst c = crypto.createCipher('aes-256-cbc', key)" }] })
    )
    expect(has(f, 'weak-crypto')).toBe(true)
  })

  it('does not flag crypto keywords that only appear inside regex patterns (self-audit case)', () => {
    const f = runAuditRules(
      input({
        files: [
          {
            path: 'src/rules/crypto.ts',
            content:
              "const checks = [\n  { re: /createCipher(?:iv)?\\s*\\(/, what: 'x' },\n  { re: /\\b(?:DES|RC4|rc4)\\b/, what: 'y' },\n  { re: /createHash\\s*\\(\\s*[\"'](?:md5|sha1)[\"']/i, what: 'z' }\n]"
          }
        ]
      })
    )
    expect(has(f, 'weak-crypto')).toBe(false)
  })

  it('does not flag SHA-1 used as a cache key', () => {
    const f = runAuditRules(
      input({
        files: [
          {
            path: 'src/util/cache.ts',
            content: `import { createHash } from 'node:crypto'
const cache = new Map<string, unknown>()
function key(content: string) {
  return createHash('sha1').update(content).digest('hex')
}
cache.set(key('x'), 1)`
          }
        ]
      })
    )
    expect(has(f, 'weak-crypto')).toBe(false)
  })

  it('still flags SHA-1 used on passwords', () => {
    const f = runAuditRules(
      input({
        files: [
          {
            path: 'src/auth/store.ts',
            content: `import { createHash } from 'node:crypto'
function hashPassword(password: string) {
  return createHash('sha1').update(password).digest('hex')
}`
          }
        ]
      })
    )
    expect(has(f, 'weak-crypto')).toBe(true)
  })
})

describe('new detectors — insecure deserialization (Python)', () => {
  it('flags pickle.loads', () => {
    const f = runAuditRules(
      input({ files: [{ path: 'api/handler.py', content: 'import pickle\ndata = pickle.loads(payload)' }] })
    )
    expect(has(f, 'insecure-deserialization')).toBe(true)
  })

  it('does not flag yaml.safe_load', () => {
    const f = runAuditRules(
      input({ files: [{ path: 'api/handler.py', content: 'import yaml\ndata = yaml.safe_load(text)' }] })
    )
    expect(has(f, 'insecure-deserialization')).toBe(false)
  })
})

describe('new detectors — JWT misuse', () => {
  it('flags algorithms: ["none"] as critical', () => {
    const f = runAuditRules(
      input({ files: [{ path: 'src/api/auth.ts', content: "jwt.verify(token, key, { algorithms: ['none'] })" }] })
    )
    const jwt = f.find((x) => x.id.startsWith('jwt-misuse'))
    expect(jwt).toBeDefined()
    expect(jwt?.severity).toBe('critical')
  })

  it('does not flag a pinned algorithm allowlist', () => {
    const f = runAuditRules(
      input({ files: [{ path: 'src/api/auth.ts', content: "jwt.verify(token, key, { algorithms: ['HS256'] })" }] })
    )
    expect(has(f, 'jwt-misuse')).toBe(false)
  })
})

describe('new detectors — NoSQL injection', () => {
  it('flags find() fed straight from req.body', () => {
    const f = runAuditRules(
      input({ files: [{ path: 'src/api/users.ts', content: 'function h(req,res){ return User.find(req.body) }' }] })
    )
    expect(has(f, 'nosql-injection')).toBe(true)
  })

  it('does not flag a typed query', () => {
    const f = runAuditRules(
      input({ files: [{ path: 'src/api/users.ts', content: 'function h(req,res){ return User.find({ id: String(req.params.id) }) }' }] })
    )
    expect(has(f, 'nosql-injection')).toBe(false)
  })
})

describe('new detectors — open redirect', () => {
  it('flags res.redirect to tainted input', () => {
    const f = runAuditRules(
      input({ files: [{ path: 'src/api/go.ts', content: 'function h(req,res){ res.redirect(req.query.next) }' }] })
    )
    expect(has(f, 'open-redirect')).toBe(true)
  })

  it('does not flag a constant redirect', () => {
    const f = runAuditRules(
      input({ files: [{ path: 'src/api/go.ts', content: "function h(req,res){ res.redirect('/home') }" }] })
    )
    expect(has(f, 'open-redirect')).toBe(false)
  })
})

describe('new detectors — mass assignment & prototype pollution', () => {
  it('flags Model.create(req.body)', () => {
    const f = runAuditRules(
      input({ files: [{ path: 'src/api/users.ts', content: 'function h(req,res){ return User.create(req.body) }' }] })
    )
    expect(has(f, 'mass-assignment')).toBe(true)
  })

  it('flags _.merge(target, req.body)', () => {
    const f = runAuditRules(
      input({ files: [{ path: 'src/api/merge.ts', content: 'function h(req,res){ _.merge(target, req.body) }' }] })
    )
    expect(has(f, 'prototype-pollution')).toBe(true)
  })
})

describe('new detectors — sensitive logging', () => {
  it('flags logging a password', () => {
    const f = runAuditRules(
      input({ files: [{ path: 'src/api/login.ts', content: 'function h(req,res){ console.log("login", password) }' }] })
    )
    expect(has(f, 'sensitive-logging')).toBe(true)
  })

  it('does not flag a benign log', () => {
    const f = runAuditRules(
      input({ files: [{ path: 'src/api/login.ts', content: 'console.log("request complete")' }] })
    )
    expect(has(f, 'sensitive-logging')).toBe(false)
  })
})

describe('new detectors — security headers', () => {
  it('flags an HTTP server with no security headers', () => {
    const f = runAuditRules(
      input({
        packageJson: serverPkg,
        files: [{ path: 'src/api/index.ts', content: "import express from 'express'\nconst app = express()\napp.get('/x', h)" }]
      })
    )
    expect(has(f, 'security-headers')).toBe(true)
  })

  it('does not flag when helmet is a dependency', () => {
    const f = runAuditRules(
      input({
        packageJson: { dependencies: { express: '^4.19.0', helmet: '^7.1.0' } },
        files: [{ path: 'src/api/index.ts', content: "import express from 'express'\nconst app = express()" }]
      })
    )
    expect(has(f, 'security-headers')).toBe(false)
  })
})

describe('new detectors — Electron hardening', () => {
  it('flags webviewTag: true', () => {
    const f = runAuditRules({
      ctx: electronCtx,
      packageJson: { dependencies: { electron: '^31.0.0' } },
      hasLockfile: true,
      files: [{ path: 'src/main/window.ts', content: 'new BrowserWindow({ webPreferences: { webviewTag: true } })' }]
    })
    expect(has(f, 'electron-hardening')).toBe(true)
  })
})

describe('new detectors — IPC validation', () => {
  it('flags raw ipcMain.handle without schema validation', () => {
    const f = runAuditRules({
      ctx: electronCtx,
      packageJson: { devDependencies: { electron: '^31.0.0' } },
      hasLockfile: true,
      files: [
        {
          path: 'src/main/ipc/bad.ts',
          content: `import { ipcMain } from 'electron'
ipcMain.handle('save-file', async (_event, raw) => {
  return fs.writeFile(raw.path, raw.data)
})`
        }
      ]
    })
    expect(has(f, 'ipc-validation')).toBe(true)
  })

  it('does not flag centralized parsePayload dispatcher', () => {
    const f = runAuditRules({
      ctx: electronCtx,
      packageJson: { devDependencies: { electron: '^31.0.0' } },
      hasLockfile: true,
      files: [
        {
          path: 'src/main/ipc/registerIpc.ts',
          content: `import { ipcMain } from 'electron'
import { parsePayload } from '../security/validateIpc.js'
const handle = (channel, fn) => {
  ipcMain.handle(channel, async (_event, raw) => fn(parsePayload(channel, raw)))
}
handle('projectOpenRecent', (p) => projects.openPath(p.path))`
        }
      ]
    })
    expect(has(f, 'ipc-validation')).toBe(false)
  })

  it('flags exposing ipcRenderer from preload', () => {
    const f = runAuditRules({
      ctx: electronCtx,
      packageJson: { devDependencies: { electron: '^31.0.0' } },
      hasLockfile: true,
      files: [
        {
          path: 'src/preload/overlay.ts',
          content: `import { contextBridge, ipcRenderer } from 'electron'
contextBridge.exposeInMainWorld('api', { ipcRenderer })`
        }
      ]
    })
    expect(has(f, 'ipc-preload-exposure')).toBe(true)
  })
})

describe('audit engine self-scan exclusion', () => {
  it('skips file-scoped rules under src/main/audit/', () => {
    const f = runAuditRules({
      ctx: electronCtx,
      packageJson: { devDependencies: { electron: '^31.0.0' } },
      hasLockfile: true,
      files: [
        {
          path: 'apps/vibebar/src/main/audit/cache.ts',
          content: "import { createHash } from 'node:crypto'\ncreateHash('sha1')"
        }
      ]
    })
    expect(has(f, 'weak-crypto')).toBe(false)
  })

  it('skips bundled artifact JS even when SHA-1 appears inside', () => {
    const bundled = `
      var __defProp = Object.defineProperty;
      const cache = /* @__PURE__ */ new Map();
      function key(content) { return createHash("sha1").update(content).digest("hex"); }
    `
    const f = runAuditRules({
      ctx: electronCtx,
      packageJson: { devDependencies: { electron: '^31.0.0' } },
      hasLockfile: true,
      files: [{ path: 'debug-out-dev/index.js', content: bundled }]
    })
    expect(has(f, 'weak-crypto')).toBe(false)
  })
})

describe('taint-driven confidence on injection rules', () => {
  it('marks command injection from req.body as high confidence', () => {
    const f = runAuditRules(
      input({ files: [{ path: 'src/api/run.ts', content: 'function h(req,res){ exec(`convert ${req.body.file} out.png`) }' }] })
    )
    const cmd = f.find((x) => x.id.startsWith('command-injection'))
    expect(cmd).toBeDefined()
    expect(cmd?.confidence).toBe('high')
  })

  it('keeps a free-variable command injection at medium confidence', () => {
    const f = runAuditRules(
      input({ files: [{ path: 'src/api/run.ts', content: 'exec(`convert ${userFile} out.png`)' }] })
    )
    const cmd = f.find((x) => x.id.startsWith('command-injection'))
    expect(cmd).toBeDefined()
    expect(cmd?.confidence).toBe('medium')
  })
})
