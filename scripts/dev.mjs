import { execFile, spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { promisify } from 'node:util'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const execFileAsync = promisify(execFile)
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

export async function cleanupStaleBackend({
  listListeners,
  readProcess,
  terminateRoot,
  wait,
  python,
  port,
  platform,
  attempts = 20,
}) {
  const listenerPids = await listListeners()
  if (listenerPids.length === 0) return

  const { roots, conflicts } = await resolveBackendRoots(
    listenerPids,
    readProcess,
    { python, port, platform },
  )
  if (conflicts.length > 0) {
    throw new Error(
      `端口 ${port} 被非本项目进程占用（PID ${conflicts.join(', ')}），未终止该进程。`,
    )
  }

  for (const rootProcess of roots.values()) {
    await terminateRoot(rootProcess)
  }

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await wait(100)
    if ((await listListeners()).length === 0) return
  }

  throw new Error(`本项目后端未能释放端口 ${port}。`)
}

export function parsePidList(output) {
  const pids = []

  for (const line of output.split(/\r?\n/)) {
    const value = line.trim()
    if (!value) continue
    if (!/^[1-9]\d*$/.test(value)) {
      throw new Error(`无法解析监听进程 PID：${value}`)
    }
    pids.push(Number(value))
  }

  return [...new Set(pids)]
}

export function parsePosixProcessRecord(output) {
  if (!output.trim()) return null
  const match = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.+?)\s*$/.exec(output)
  if (!match) throw new Error(`无法解析进程信息：${output.trim()}`)

  return {
    pid: Number(match[1]),
    parentPid: Number(match[2]),
    processGroupId: Number(match[3]),
    command: match[4],
  }
}

export function parseWindowsProcessRecord(output) {
  const value = output.trim()
  if (!value) return null
  const match = /^(\d+)\t(\d+)\t(.+)$/.exec(value)
  if (!match) throw new Error(`无法解析进程信息：${value}`)

  return {
    pid: Number(match[1]),
    parentPid: Number(match[2]),
    processGroupId: Number(match[1]),
    command: match[3],
  }
}

export async function listListeningPids(
  port,
  {
    platform = process.platform,
    execFileProcess = execFileAsync,
  } = {},
) {
  try {
    if (platform === 'win32') {
      const script = [
        `Get-NetTCPConnection -State Listen -LocalPort ${port} -ErrorAction SilentlyContinue`,
        'Select-Object -ExpandProperty OwningProcess -Unique',
      ].join(' | ')
      const { stdout } = await execFileProcess(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-Command', script],
        { windowsHide: true },
      )
      return parsePidList(String(stdout))
    }

    const { stdout } = await execFileProcess(
      'lsof',
      ['-nP', '-t', `-iTCP:${port}`, '-sTCP:LISTEN'],
      { windowsHide: true },
    )
    return parsePidList(String(stdout))
  } catch (error) {
    if (error?.code === 1 && !String(error.stdout ?? '').trim()) return []
    throw error
  }
}

export async function readProcessRecord(
  pid,
  {
    platform = process.platform,
    execFileProcess = execFileAsync,
  } = {},
) {
  try {
    if (platform === 'win32') {
      const script = [
        `$process = Get-CimInstance Win32_Process -Filter 'ProcessId = ${pid}'`,
        'if ($process) { "$($process.ProcessId)`t$($process.ParentProcessId)`t$($process.CommandLine)" }',
      ].join('; ')
      const { stdout } = await execFileProcess(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-Command', script],
        { windowsHide: true },
      )
      return parseWindowsProcessRecord(String(stdout))
    }

    const { stdout } = await execFileProcess(
      'ps',
      ['-p', String(pid), '-o', 'pid=,ppid=,pgid=,command='],
      { windowsHide: true },
    )
    return parsePosixProcessRecord(String(stdout))
  } catch (error) {
    if (error?.code === 1 && !String(error.stdout ?? '').trim()) return null
    throw error
  }
}

export async function terminateProcessRoot(
  record,
  {
    platform = process.platform,
    killProcess = process.kill,
    spawnProcess = spawn,
  } = {},
) {
  if (platform !== 'win32') {
    try {
      killProcess(-record.processGroupId, 'SIGTERM')
    } catch (error) {
      if (error?.code !== 'ESRCH') throw error
    }
    return
  }

  await new Promise((resolve, reject) => {
    const taskkill = spawnProcess(
      'taskkill',
      ['/pid', String(record.pid), '/T', '/F'],
      { stdio: 'ignore', windowsHide: true },
    )
    let settled = false
    taskkill.once('error', (error) => {
      settled = true
      reject(error)
    })
    taskkill.once('close', (code) => {
      if (settled) return
      if (code === 0) resolve()
      else reject(new Error(`taskkill 退出码 ${code ?? 1}`))
    })
  })
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

export async function runLauncher({
  platform = process.platform,
  spawnProcess = spawn,
  killProcess = process.kill,
  exitProcess = process.exit,
  schedule = setTimeout,
  registerSignal = (signal, handler) => process.once(signal, handler),
  cleanupBackend,
} = {}) {
  const python = platform === 'win32'
    ? path.join(root, '.venv', 'Scripts', 'python.exe')
    : path.join(root, '.venv', 'bin', 'python')
  const npm = platform === 'win32' ? 'npm.cmd' : 'npm'
  const performCleanup = cleanupBackend ?? (() => cleanupStaleBackend({
    listListeners: () => listListeningPids(API_PORT, { platform }),
    readProcess: (pid) => readProcessRecord(pid, { platform }),
    terminateRoot: async (record) => {
      console.log(`正在终止本项目残留 FastAPI 进程（PID ${record.pid}）……`)
      await terminateProcessRoot(record, { platform, killProcess, spawnProcess })
    },
    wait: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
    python,
    port: API_PORT,
    platform,
  }))

  await performCleanup()

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

  registerSignal('SIGINT', () => shutdown(130, 'SIGINT'))
  registerSignal('SIGTERM', () => shutdown(143, 'SIGTERM'))
  start(
    'FastAPI',
    python,
    ['-m', 'uvicorn', 'app.main:app', '--reload', '--host', '127.0.0.1', '--port', String(API_PORT)],
    path.join(root, 'backend'),
  )
  start('Vite', npm, ['run', 'dev', '--', '--host', '127.0.0.1'], path.join(root, 'frontend'))
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runLauncher().catch((error) => {
    console.error(`开发服务启动前检查失败：${error.message}`)
    process.exit(1)
  })
}
