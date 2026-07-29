import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const API_PORT = 8765

function normalizedCommand(command, platform) {
  return platform === 'win32' ? command.toLowerCase() : command
}

export function isProjectBackendCommand(command, { python, port, platform }) {
  const haystack = normalizedCommand(command, platform)
  const expectedPython = normalizedCommand(python, platform)
  const pythonPrefixes = [
    expectedPython,
    `"${expectedPython}"`,
    `'${expectedPython}'`,
  ]
  const usesExpectedPython = pythonPrefixes.some(
    (prefix) => haystack === prefix || haystack.startsWith(`${prefix} `),
  )

  return usesExpectedPython
    && /(?:^|\s)-m\s+uvicorn(?:\s|$)/.test(haystack)
    && /(?:^|\s)app\.main:app(?:\s|$)/.test(haystack)
    && new RegExp(`(?:^|\\s)--port(?:=|\\s+)${port}(?:\\s|$)`).test(haystack)
}

export async function resolveBackendRoots(listenerPids, readProcess, identity) {
  const roots = new Map()
  const conflicts = []

  for (const listenerPid of listenerPids) {
    const visited = new Set()
    let pid = listenerPid
    let root = null

    while (pid > 1 && !visited.has(pid)) {
      visited.add(pid)
      const record = await readProcess(pid)
      if (!record) break
      if (isProjectBackendCommand(record.command, identity)) {
        root = record
        break
      }
      pid = record.parentPid
    }

    if (root) roots.set(root.pid, root)
    else conflicts.push(listenerPid)
  }

  return { roots, conflicts }
}

export function terminateChild(
  child,
  signal,
  {
    platform = process.platform,
    killProcess = process.kill,
    spawnProcess = spawn,
  } = {},
) {
  if (!child?.pid || child.exitCode != null || child.signalCode != null) return

  if (platform === 'win32') {
    try {
      const taskkill = spawnProcess(
        'taskkill',
        ['/pid', String(child.pid), '/T', '/F'],
        { stdio: 'ignore', windowsHide: true },
      )
      taskkill.once('error', () => {})
    } catch {
      // A process can exit between the state check and taskkill invocation.
    }
    return
  }

  try {
    killProcess(-child.pid, signal)
  } catch {
    if (child.exitCode == null && child.signalCode == null) child.kill(signal)
  }
}

export function runLauncher({
  platform = process.platform,
  spawnProcess = spawn,
  killProcess = process.kill,
  exitProcess = process.exit,
  schedule = setTimeout,
} = {}) {
  const python = platform === 'win32'
    ? path.join(root, '.venv', 'Scripts', 'python.exe')
    : path.join(root, '.venv', 'bin', 'python')
  const npm = platform === 'win32' ? 'npm.cmd' : 'npm'
  let shuttingDown = false
  let exitCode = 0
  const children = new Set()

  function forward(signal) {
    for (const child of children) {
      terminateChild(child, signal, { platform, killProcess, spawnProcess })
    }
  }

  function shutdown(code, signal = 'SIGTERM') {
    if (shuttingDown) return
    shuttingDown = true
    exitCode = code
    forward(signal)
    if (children.size === 0) {
      exitProcess(exitCode)
      return
    }
    schedule(() => exitProcess(exitCode), 5_000).unref()
  }

  function start(name, command, args, cwd) {
    const child = spawnProcess(command, args, {
      cwd,
      stdio: 'inherit',
      detached: platform !== 'win32',
    })
    children.add(child)

    child.once('error', (error) => {
      console.error(`${name} 启动失败：${error.message}`)
      shutdown(1)
    })
    child.once('close', (code, signal) => {
      children.delete(child)
      if (!shuttingDown) {
        console.error(`${name} 已退出（${signal ?? `退出码 ${code ?? 1}`}）。`)
        shutdown(code === 0 ? 1 : (code ?? 1))
        return
      }
      if (children.size === 0) exitProcess(exitCode)
    })
  }

  process.once('SIGINT', () => shutdown(130, 'SIGINT'))
  process.once('SIGTERM', () => shutdown(143, 'SIGTERM'))
  start(
    'FastAPI',
    python,
    ['-m', 'uvicorn', 'app.main:app', '--reload', '--host', '127.0.0.1', '--port', String(API_PORT)],
    path.join(root, 'backend'),
  )
  start('Vite', npm, ['run', 'dev', '--', '--host', '127.0.0.1'], path.join(root, 'frontend'))
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runLauncher()
}
