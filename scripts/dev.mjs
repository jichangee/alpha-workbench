import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const python = process.platform === 'win32'
  ? path.join(root, '.venv', 'Scripts', 'python.exe')
  : path.join(root, '.venv', 'bin', 'python')
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'

let shuttingDown = false
let exitCode = 0
const children = new Set()

function forward(signal) {
  for (const child of children) {
    if (child.pid && process.platform !== 'win32') {
      try {
        process.kill(-child.pid, signal)
        continue
      } catch {
        // The child may have already exited; its close handler will finish shutdown.
      }
    }
    child.kill(signal)
  }
}

function shutdown(code, signal = 'SIGTERM') {
  if (shuttingDown) return
  shuttingDown = true
  exitCode = code
  forward(signal)
  if (children.size === 0) process.exit(exitCode)
  setTimeout(() => process.exit(exitCode), 5_000).unref()
}

function start(name, command, args, cwd) {
  const child = spawn(command, args, {
    cwd,
    stdio: 'inherit',
    detached: process.platform !== 'win32',
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
    if (children.size === 0) process.exit(exitCode)
  })
}

process.once('SIGINT', () => shutdown(130, 'SIGINT'))
process.once('SIGTERM', () => shutdown(143, 'SIGTERM'))

start('FastAPI', python, ['-m', 'uvicorn', 'app.main:app', '--reload', '--host', '127.0.0.1', '--port', '8000'], path.join(root, 'backend'))
start('Vite', npm, ['run', 'dev', '--', '--host', '127.0.0.1'], path.join(root, 'frontend'))
