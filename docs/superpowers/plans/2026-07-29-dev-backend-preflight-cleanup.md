# Dev Backend Preflight Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `npm run dev` terminate a verified stale FastAPI process from this repository before starting FastAPI and Vite, without killing an unrelated owner of port 8765.

**Architecture:** Add pure process-identity helpers and an injected asynchronous preflight to `scripts/dev.mjs`, then connect them to small macOS/Linux and Windows process-discovery adapters. Resolve each listening PID through its ancestor chain because uvicorn reload workers inherit the socket but do not contain `-m uvicorn` in their own command line; terminate only the deduplicated verified backend roots and wait for the port to become free before spawning either service.

**Tech Stack:** Node.js ESM, `node:child_process`, `node:test`, built-in OS commands (`lsof`/`ps` on macOS and Linux, PowerShell/`taskkill` on Windows)

## Global Constraints

- A process is owned only when an ancestor command contains this repository's exact `.venv` Python executable, `-m uvicorn`, `app.main:app`, and `--port 8765`.
- An unrelated or unverifiable listener on port 8765 must never be terminated.
- FastAPI and Vite must start only after the preflight proves that port 8765 is free.
- Cleanup must terminate the verified process group on macOS/Linux and the verified process tree on Windows.
- Do not add an npm dependency or require the user to install a new global tool.
- Preserve the existing behavior that one development child exiting shuts down the other.
- Do not stage or overwrite unrelated existing worktree changes; `README.md` already contains unrelated user edits.

---

## File Structure

- Modify `scripts/dev.mjs`: process records, ownership classification, OS process discovery, stale-backend preflight, and asynchronous launcher entry point.
- Modify `scripts/dev.test.mjs`: focused tests for identity, ancestor resolution, cleanup sequencing, conflict handling, timeout handling, and existing process-tree termination.
- Modify `README.md`: append one startup-behavior sentence to the existing `npm run dev` paragraph while preserving all pre-existing README edits.

### Task 1: Classify verified backend roots

**Files:**
- Modify: `scripts/dev.mjs`
- Test: `scripts/dev.test.mjs`

**Interfaces:**
- Produces: `isProjectBackendCommand(command: string, { python: string, port: number, platform: string }): boolean`
- Produces: `resolveBackendRoots(listenerPids: number[], readProcess: (pid: number) => Promise<{ pid: number, parentPid: number, processGroupId: number, command: string } | null>, identity: { python: string, port: number, platform: string }): Promise<{ roots: Map<number, ProcessRecord>, conflicts: number[] }>`
- `resolveBackendRoots` walks from each listener to its parents until it finds a verified command, detects parent cycles, deduplicates roots by PID, and reports listeners with no verified ancestor in `conflicts`.

- [ ] **Step 1: Read the test-quality rules before editing tests**

Run:

```bash
sed -n '1,320p' /Users/xuejichang/.codex/plugins/cache/openai-curated-remote/superpowers/6.2.0/skills/test-driven-development/writing-good-tests.md
```

Expected: the complete test-quality guide is visible before any test changes.

- [ ] **Step 2: Write failing command-identity tests**

Add imports for `isProjectBackendCommand` and `resolveBackendRoots`, then add:

```js
const identity = {
  python: '/workspace/huice/.venv/bin/python',
  port: 8765,
  platform: 'darwin',
}

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
    [100, { pid: 100, parentPid: 1, processGroupId: 100, command: '/workspace/huice/.venv/bin/python -m uvicorn app.main:app --reload --port 8765' }],
    [101, { pid: 101, parentPid: 100, processGroupId: 100, command: '/workspace/huice/.venv/bin/python -c from multiprocessing.spawn import spawn_main' }],
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
    [200, { pid: 200, parentPid: 1, processGroupId: 200, command: '/usr/bin/python3 -m http.server 8765' }],
  ])

  const result = await resolveBackendRoots(
    [200],
    async (pid) => records.get(pid) ?? null,
    identity,
  )

  assert.deepEqual([...result.roots.keys()], [])
  assert.deepEqual(result.conflicts, [200])
})
```

- [ ] **Step 3: Run the focused tests and verify RED**

Run:

```bash
node --test scripts/dev.test.mjs
```

Expected: FAIL because `isProjectBackendCommand` and `resolveBackendRoots` are not exported.

- [ ] **Step 4: Implement minimal identity and ancestor resolution**

In `scripts/dev.mjs`, add:

```js
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
```

- [ ] **Step 5: Run tests and verify GREEN**

Run:

```bash
node --test scripts/dev.test.mjs
```

Expected: all launcher tests pass.

- [ ] **Step 6: Commit the self-contained classification change**

```bash
git add -- scripts/dev.mjs scripts/dev.test.mjs
git commit -m "feat: identify stale project backends"
```

Expected: only the two launcher files are included.

### Task 2: Stop verified stale backends before launch

**Files:**
- Modify: `scripts/dev.mjs`
- Test: `scripts/dev.test.mjs`

**Interfaces:**
- Consumes: `resolveBackendRoots(...)` from Task 1.
- Produces: `cleanupStaleBackend({ listListeners, readProcess, terminateRoot, wait, python, port, platform, attempts? }): Promise<void>`
- `listListeners(): Promise<number[]>`
- `terminateRoot(record: ProcessRecord): Promise<void>`
- `wait(milliseconds: number): Promise<void>`

- [ ] **Step 1: Write failing preflight sequencing tests**

Add:

```js
test('terminates verified roots and waits until the API port is free', async () => {
  const events = []
  const listenerSnapshots = [[100, 101], [101], []]
  const records = new Map([
    [100, { pid: 100, parentPid: 1, processGroupId: 100, command: '/workspace/huice/.venv/bin/python -m uvicorn app.main:app --reload --port 8765' }],
    [101, { pid: 101, parentPid: 100, processGroupId: 100, command: '/workspace/huice/.venv/bin/python -c worker' }],
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
      readProcess: async () => ({ pid: 200, parentPid: 1, processGroupId: 200, command: '/usr/bin/python3 -m http.server 8765' }),
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
      readProcess: async () => ({ pid: 100, parentPid: 1, processGroupId: 100, command: '/workspace/huice/.venv/bin/python -m uvicorn app.main:app --port 8765' }),
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
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
node --test scripts/dev.test.mjs
```

Expected: FAIL because `cleanupStaleBackend` is not exported.

- [ ] **Step 3: Implement the injected cleanup orchestration**

Add an exported `cleanupStaleBackend` that:

```js
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
    throw new Error(`端口 ${port} 被非本项目进程占用（PID ${conflicts.join(', ')}），未终止该进程。`)
  }

  for (const root of roots.values()) await terminateRoot(root)

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await wait(100)
    if ((await listListeners()).length === 0) return
  }
  throw new Error(`本项目后端未能释放端口 ${port}。`)
}
```

Keep `attempts` injectable so timeout behavior remains deterministic in tests.

- [ ] **Step 4: Run tests and verify GREEN**

Run:

```bash
node --test scripts/dev.test.mjs
```

Expected: all launcher tests pass.

- [ ] **Step 5: Commit the cleanup workflow**

```bash
git add -- scripts/dev.mjs scripts/dev.test.mjs
git commit -m "feat: clean stale backend before dev launch"
```

Expected: only the two launcher files are included.

### Task 3: Connect process discovery and asynchronous startup

**Files:**
- Modify: `scripts/dev.mjs`
- Test: `scripts/dev.test.mjs`

**Interfaces:**
- Consumes: `cleanupStaleBackend(...)` from Task 2.
- Produces: `listListeningPids(port, { platform, execFileProcess }): Promise<number[]>`
- Produces: `readProcessRecord(pid, { platform, execFileProcess }): Promise<ProcessRecord | null>`
- Produces: `terminateProcessRoot(record, { platform, killProcess, spawnProcess }): Promise<void>`
- Produces: `parsePidList(output: string): number[]`
- Changes: `runLauncher(...)` returns `Promise<void>` and accepts `cleanupBackend` for deterministic launch-order testing.

- [ ] **Step 1: Write failing parser and launch-order tests**

Add tests proving:

```js
test('does not spawn either service until backend cleanup completes', async () => {
  let releaseCleanup
  const cleanupGate = new Promise((resolve) => { releaseCleanup = resolve })
  const spawned = []
  const launchPromise = runLauncher({
    cleanupBackend: async () => cleanupGate,
    spawnProcess(command, args, options) {
      spawned.push({ command, args, options })
      return fakeChild()
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

test('parses unique positive listener PIDs', () => {
  assert.deepEqual(parsePidList('100\\n101\\n100\\n'), [100, 101])
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
```

Define `fakeChild()` in the test file as an `EventEmitter` with `pid`,
`exitCode`, `signalCode`, and `kill()` so tests exercise the real launcher
registration without spawning live services.

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
node --test scripts/dev.test.mjs
```

Expected: FAIL because `parsePidList` is not exported and `runLauncher` does not await cleanup.

- [ ] **Step 3: Implement production OS adapters**

Use promisified `execFile` calls with `windowsHide: true`.

For macOS/Linux:

```js
await execFileProcess('lsof', ['-nP', '-t', `-iTCP:${port}`, '-sTCP:LISTEN'])
await execFileProcess('ps', ['-p', String(pid), '-o', 'pid=,ppid=,pgid=,command='])
```

Treat `lsof` exit code 1 with empty stdout as “no listener”; rethrow other
execution failures. Parse the three numeric `ps` columns before retaining the
rest of the line as the command.

For Windows, invoke PowerShell without interpolating untrusted input:

```powershell
Get-NetTCPConnection -State Listen -LocalPort 8765 -ErrorAction SilentlyContinue |
  Select-Object -ExpandProperty OwningProcess -Unique
```

and:

```js
const script = [
  `$p = Get-CimInstance Win32_Process -Filter 'ProcessId = ${pid}'`,
  'if ($p) { "$($p.ProcessId)`t$($p.ParentProcessId)`t$($p.CommandLine)" }',
].join('; ')
```

Map Windows `processGroupId` to the PID because cleanup uses `taskkill /T /F`.
Reject malformed non-empty process output instead of treating it as safe.

- [ ] **Step 4: Connect root termination**

On macOS/Linux call `killProcess(-record.processGroupId, 'SIGTERM')`. Ignore
only `ESRCH`, which means the group exited between inspection and cleanup;
propagate permission and other failures rather than falling back to a
single-process kill that could leave the uvicorn worker alive.
On Windows spawn:

```js
spawnProcess('taskkill', ['/pid', String(record.pid), '/T', '/F'], {
  stdio: 'ignore',
  windowsHide: true,
})
```

Resolve when `taskkill` closes successfully and reject its `error` event or
non-zero exit code.

- [ ] **Step 5: Make launch await preflight**

Change `runLauncher` to `async`, compute the platform-specific Python path,
await the injected `cleanupBackend` (defaulting to the production preflight),
then register signal handlers and spawn FastAPI followed by Vite.

Inject:

```js
registerSignal = (signal, handler) => process.once(signal, handler)
```

to prevent unit tests from installing live signal listeners. Wrap the CLI entry
point:

```js
runLauncher().catch((error) => {
  console.error(`开发服务启动前检查失败：${error.message}`)
  process.exit(1)
})
```

- [ ] **Step 6: Run tests and verify GREEN**

Run:

```bash
node --test scripts/dev.test.mjs
```

Expected: all launcher tests pass with no live child processes.

- [ ] **Step 7: Commit OS integration**

```bash
git add -- scripts/dev.mjs scripts/dev.test.mjs
git commit -m "feat: run backend cleanup preflight"
```

Expected: only the launcher implementation and its tests are included.

### Task 4: Document and verify end-to-end behavior

**Files:**
- Modify: `README.md`
- Verify: `scripts/dev.mjs`
- Verify: `scripts/dev.test.mjs`

**Interfaces:**
- Consumes the completed root `npm run dev` behavior.
- Produces user-facing documentation of safe stale-backend cleanup.

- [ ] **Step 1: Update the startup paragraph without disturbing existing README edits**

Append this sentence after the current `Ctrl+C` sentence:

```markdown
再次启动时，脚本会先终止经命令行确认属于本项目的残留 FastAPI 进程并等待 8765 端口释放；如果端口由其他程序占用，脚本会保留该进程并明确报错。
```

Review `git diff -- README.md` and confirm the pre-existing introduction and
portfolio-comparison changes remain byte-for-byte intact.

- [ ] **Step 2: Run focused launcher tests**

Run:

```bash
node --test scripts/dev.test.mjs
```

Expected: all launcher tests pass.

- [ ] **Step 3: Run the complete repository test command**

Run:

```bash
npm test
```

Expected: Node launcher tests, backend pytest, and frontend Vitest all pass.

- [ ] **Step 4: Exercise the real stale-process recovery**

Confirm port 8765 is currently owned by this repository's stale uvicorn:

```bash
lsof -nP -iTCP:8765 -sTCP:LISTEN
stale_backend_pids="$(lsof -nP -t -iTCP:8765 -sTCP:LISTEN | paste -sd, -)"
ps -p "$stale_backend_pids" -o pid=,ppid=,pgid=,command=
```

Run `npm run dev`, wait until both uvicorn and Vite report ready, then send
`Ctrl+C`. Verify:

```bash
lsof -nP -iTCP:8765 -sTCP:LISTEN
lsof -nP -iTCP:5173 -sTCP:LISTEN
```

Expected: startup logs report stale backend cleanup, both services become
ready, and both ports have no listener after `Ctrl+C`.

- [ ] **Step 5: Review the final diff**

Run:

```bash
git diff --check
git diff -- scripts/dev.mjs scripts/dev.test.mjs README.md
git status --short
```

Expected: no whitespace errors; implementation changes are limited to the two
launcher files plus the intended README sentence; all unrelated user changes
remain present.

- [ ] **Step 6: Preserve the user's pre-existing README changes**

Do not run `git add README.md`, because that would stage unrelated user work.
Leave the documentation sentence in the working tree and report it explicitly.
The launcher code and tests should already be committed by the earlier tasks.
