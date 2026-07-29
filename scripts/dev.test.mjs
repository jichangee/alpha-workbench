import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test from 'node:test'

import {
  API_PORT,
  cleanupStaleBackend,
  isProjectBackendCommand,
  listListeningPids,
  parsePidList,
  parsePosixProcessRecord,
  parseWindowsProcessRecord,
  resolveBackendRoots,
  runLauncher,
  terminateChild,
  terminateProcessRoot,
} from './dev.mjs'

const identity = {
  python: '/workspace/huice/.venv/bin/python',
  port: 8765,
  platform: 'darwin',
}

function fakeChild(pid = 300) {
  const child = new EventEmitter()
  child.pid = pid
  child.exitCode = null
  child.signalCode = null
  child.kill = () => {}
  return child
}

test('launcher uses the project local API port', () => {
  assert.equal(API_PORT, 8765)
})

test('recognizes only this project uvicorn command', () => {
  assert.equal(isProjectBackendCommand(
    '/workspace/huice/.venv/bin/python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8765',
    identity,
  ), true)
  assert.equal(isProjectBackendCommand(
    '/other/.venv/bin/python -m uvicorn app.main:app --port 8765',
    identity,
  ), false)
  assert.equal(isProjectBackendCommand(
    '/workspace/huice/.venv/bin/python -m http.server 8765',
    identity,
  ), false)
  assert.equal(isProjectBackendCommand(
    '/workspace/huice/.venv/bin/python-wrapper -m uvicorn app.main:app --port 8765',
    identity,
  ), false)
})

test('resolves an inherited listener socket to the verified uvicorn ancestor', async () => {
  const records = new Map([
    [100, {
      pid: 100,
      parentPid: 1,
      processGroupId: 100,
      command: '/workspace/huice/.venv/bin/python -m uvicorn app.main:app --reload --port 8765',
    }],
    [101, {
      pid: 101,
      parentPid: 100,
      processGroupId: 100,
      command: '/workspace/huice/.venv/bin/python -c from multiprocessing.spawn import spawn_main',
    }],
  ])

  const result = await resolveBackendRoots(
    [100, 101],
    async (pid) => records.get(pid) ?? null,
    identity,
  )

  assert.deepEqual([...result.roots.keys()], [100])
  assert.deepEqual(result.conflicts, [])
})

test('reports a listener whose ancestors do not belong to this project', async () => {
  const records = new Map([
    [200, {
      pid: 200,
      parentPid: 1,
      processGroupId: 200,
      command: '/usr/bin/python3 -m http.server 8765',
    }],
  ])

  const result = await resolveBackendRoots(
    [200],
    async (pid) => records.get(pid) ?? null,
    identity,
  )

  assert.deepEqual([...result.roots.keys()], [])
  assert.deepEqual(result.conflicts, [200])
})

test('terminates verified roots and waits until the API port is free', async () => {
  const events = []
  const listenerSnapshots = [[100, 101], [101], []]
  const records = new Map([
    [100, {
      pid: 100,
      parentPid: 1,
      processGroupId: 100,
      command: '/workspace/huice/.venv/bin/python -m uvicorn app.main:app --reload --port 8765',
    }],
    [101, {
      pid: 101,
      parentPid: 100,
      processGroupId: 100,
      command: '/workspace/huice/.venv/bin/python -c worker',
    }],
  ])

  await cleanupStaleBackend({
    listListeners: async () => listenerSnapshots.shift() ?? [],
    readProcess: async (pid) => records.get(pid) ?? null,
    terminateRoot: async (record) => events.push(`terminate:${record.pid}`),
    wait: async () => events.push('wait'),
    python: identity.python,
    port: identity.port,
    platform: identity.platform,
    attempts: 3,
  })

  assert.deepEqual(events, ['terminate:100', 'wait', 'wait'])
})

test('refuses to terminate an unrelated API port listener', async () => {
  let terminateCalls = 0

  await assert.rejects(
    cleanupStaleBackend({
      listListeners: async () => [200],
      readProcess: async () => ({
        pid: 200,
        parentPid: 1,
        processGroupId: 200,
        command: '/usr/bin/python3 -m http.server 8765',
      }),
      terminateRoot: async () => { terminateCalls += 1 },
      wait: async () => {},
      python: identity.python,
      port: identity.port,
      platform: identity.platform,
    }),
    /8765.*200/,
  )

  assert.equal(terminateCalls, 0)
})

test('fails when a verified backend does not release the port', async () => {
  await assert.rejects(
    cleanupStaleBackend({
      listListeners: async () => [100],
      readProcess: async () => ({
        pid: 100,
        parentPid: 1,
        processGroupId: 100,
        command: '/workspace/huice/.venv/bin/python -m uvicorn app.main:app --port 8765',
      }),
      terminateRoot: async () => {},
      wait: async () => {},
      python: identity.python,
      port: identity.port,
      platform: identity.platform,
      attempts: 2,
    }),
    /未能释放.*8765/,
  )
})

test('propagates process inspection failures without terminating anything', async () => {
  let terminateCalls = 0

  await assert.rejects(
    cleanupStaleBackend({
      listListeners: async () => [100],
      readProcess: async () => { throw new Error('ps failed') },
      terminateRoot: async () => { terminateCalls += 1 },
      wait: async () => {},
      python: identity.python,
      port: identity.port,
      platform: identity.platform,
    }),
    /ps failed/,
  )

  assert.equal(terminateCalls, 0)
})

test('parses unique positive listener PIDs and rejects malformed output', () => {
  assert.deepEqual(parsePidList('100\n101\n100\n'), [100, 101])
  assert.throws(() => parsePidList('100\nnot-a-pid\n'), /not-a-pid/)
})

test('parses a POSIX process record without truncating its command', () => {
  assert.deepEqual(
    parsePosixProcessRecord(
      '  101   100   100 /workspace/.venv/bin/python -c from multiprocessing.spawn import spawn_main\n',
    ),
    {
      pid: 101,
      parentPid: 100,
      processGroupId: 100,
      command: '/workspace/.venv/bin/python -c from multiprocessing.spawn import spawn_main',
    },
  )
  assert.equal(parsePosixProcessRecord(''), null)
  assert.throws(() => parsePosixProcessRecord('malformed output'), /malformed output/)
})

test('parses a Windows process record without truncating its command', () => {
  assert.deepEqual(
    parseWindowsProcessRecord(
      '101\t100\t"C:\\workspace\\huice\\.venv\\Scripts\\python.exe" -m uvicorn app.main:app --port 8765\r\n',
    ),
    {
      pid: 101,
      parentPid: 100,
      processGroupId: 101,
      command: '"C:\\workspace\\huice\\.venv\\Scripts\\python.exe" -m uvicorn app.main:app --port 8765',
    },
  )
  assert.equal(parseWindowsProcessRecord(''), null)
  assert.throws(() => parseWindowsProcessRecord('malformed output'), /malformed output/)
})

test('treats lsof exit code 1 with empty output as no listeners', async () => {
  const noListenerError = new Error('no matches')
  noListenerError.code = 1
  noListenerError.stdout = ''

  assert.deepEqual(
    await listListeningPids(8765, {
      platform: 'darwin',
      execFileProcess: async () => { throw noListenerError },
    }),
    [],
  )
})

test('does not spawn either service until backend cleanup completes', async () => {
  let releaseCleanup
  const cleanupGate = new Promise((resolve) => { releaseCleanup = resolve })
  const spawned = []
  const launchPromise = runLauncher({
    cleanupBackend: async () => cleanupGate,
    spawnProcess(command, args, options) {
      spawned.push({ command, args, options })
      return fakeChild(300 + spawned.length)
    },
    exitProcess() {},
    registerSignal() {},
  })

  await Promise.resolve()
  assert.equal(spawned.length, 0)
  releaseCleanup()
  await launchPromise
  assert.equal(spawned.length, 2)
})

test('does not spawn services when backend cleanup fails', async () => {
  const spawned = []

  await assert.rejects(
    runLauncher({
      cleanupBackend: async () => { throw new Error('inspection failed') },
      spawnProcess(...args) {
        spawned.push(args)
        return fakeChild()
      },
      exitProcess() {},
      registerSignal() {},
    }),
    /inspection failed/,
  )

  assert.equal(spawned.length, 0)
})

test('POSIX root cleanup signals the verified process group', async () => {
  const calls = []

  await terminateProcessRoot(
    { pid: 100, parentPid: 1, processGroupId: 100, command: 'verified' },
    {
      platform: 'darwin',
      killProcess: (pid, signal) => calls.push({ pid, signal }),
    },
  )

  assert.deepEqual(calls, [{ pid: -100, signal: 'SIGTERM' }])
})

test('Windows root cleanup waits for taskkill to finish', async () => {
  const calls = []

  await terminateProcessRoot(
    { pid: 4321, parentPid: 1, processGroupId: 4321, command: 'verified' },
    {
      platform: 'win32',
      spawnProcess(command, args, options) {
        calls.push({ command, args, options })
        const child = new EventEmitter()
        queueMicrotask(() => child.emit('close', 0))
        return child
      },
    },
  )

  assert.deepEqual(calls, [{
    command: 'taskkill',
    args: ['/pid', '4321', '/T', '/F'],
    options: { stdio: 'ignore', windowsHide: true },
  }])
})

test('Windows launcher cleanup uses taskkill for the whole child process tree', () => {
  const calls = []

  terminateChild(
    { pid: 4321, exitCode: null, signalCode: null },
    'SIGTERM',
    {
      platform: 'win32',
      spawnProcess(command, args, options) {
        calls.push({ command, args, options })
        return { once() {} }
      },
    },
  )

  assert.deepEqual(calls, [{
    command: 'taskkill',
    args: ['/pid', '4321', '/T', '/F'],
    options: { stdio: 'ignore', windowsHide: true },
  }])
})

test('Windows launcher cleanup skips a child that has already exited', () => {
  let taskkillCalls = 0

  terminateChild(
    { pid: 4321, exitCode: 0, signalCode: null },
    'SIGTERM',
    {
      platform: 'win32',
      spawnProcess() {
        taskkillCalls += 1
        return { once() {} }
      },
    },
  )

  assert.equal(taskkillCalls, 0)
})
