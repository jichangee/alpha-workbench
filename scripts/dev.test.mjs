import assert from 'node:assert/strict'
import test from 'node:test'

import { terminateChild } from './dev.mjs'

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
