# Dev Backend Preflight Cleanup Design

## Goal

Make root-level `npm run dev` recover automatically when a FastAPI process
from this repository survived an earlier interrupted launcher. The launcher
must stop only a verified stale backend from this project, wait for port 8765
to become available, and then start FastAPI and Vite together.

## Safety Boundary

Port ownership alone is not permission to terminate a process. A listener is
eligible for cleanup only when its process details identify the command as this
repository's backend:

- it uses the Python executable from this repository's `.venv`;
- it runs the `uvicorn` module;
- it serves `app.main:app`; and
- it is configured for API port 8765.

If any listener on port 8765 cannot be verified against all of those
conditions, the launcher leaves it running and exits with a clear port-conflict
message. The cleanup does not target Vite or any unrelated service.

## Startup Flow

Before either development service starts, the launcher performs an asynchronous
preflight:

1. Discover processes listening on `127.0.0.1:8765`.
2. Read enough process information to classify each listener.
3. If there are no listeners, continue immediately.
4. If every listener belongs to this project's backend, terminate its process
   tree using the platform-appropriate mechanism.
5. Poll for a bounded period until port 8765 has no listeners.
6. Start FastAPI and Vite only after the port is free.

If discovery fails, an unrelated listener is found, or verified backend
processes do not release the port before the timeout, the launcher exits before
starting either service and explains the failure.

## Platform Behavior

On macOS and Linux, the launcher uses operating-system process and socket
information to discover listener PIDs and verify their command lines. It
terminates the corresponding backend process groups so uvicorn's reload worker
does not survive independently.

On Windows, listener discovery and command-line verification use built-in
system facilities, while cleanup continues to use `taskkill /T /F` for the
verified backend tree. No new npm package or global utility is introduced.

## Code Structure

`scripts/dev.mjs` will keep process discovery, ownership classification,
termination, and bounded waiting as small exported functions with injected
system operations where needed. `runLauncher` becomes asynchronous and invokes
the preflight before registering signals and spawning FastAPI and Vite. The
existing runtime shutdown behavior remains unchanged.

`scripts/dev.test.mjs` will exercise the exported behavior with deterministic
fake process data rather than terminating live development services.

## Tests

The launcher tests will verify:

- a listener matching this repository's Python, uvicorn app, and port is
  selected for cleanup;
- an unrelated listener on port 8765 is rejected and never terminated;
- both services start only after verified stale listeners disappear;
- cleanup timeout or process-inspection failure prevents either service from
  starting and reports an error;
- existing Unix process-group and Windows process-tree shutdown behavior
  remains intact.

The focused Node test suite will run before and after implementation, followed
by the repository's relevant test command. README startup documentation will
state that `npm run dev` removes verified stale project backends before launch
and refuses to kill unrelated port owners.
