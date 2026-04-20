/**
 * Per-session async mutex.
 *
 * `executeTurnAndCommit` is load → execute → commit; only the commit runs
 * inside `LocalDB.mutate()`'s write queue.  That leaves a window where two
 * concurrent requests to the same session both load the same turn_index,
 * both execute, and the second commit fails the monotonic guard with
 * `non-monotonic turn_index N (existing max N+1)`.
 *
 * Causes in practice: user double-click submit, two open tabs, Next.js dev
 * HMR re-invoking a stale request, or a retry after a transient error.
 *
 * The lock is keyed by sessionId and pinned to globalThis so Next.js dev
 * mode's per-route-module evaluation shares one lock table (same trick as
 * LocalDB).  Single-process only; fine for one Node instance.
 */

const GLOBAL_KEY = Symbol.for('__coc_session_lock_table__');
type LockTable = Map<string, Promise<unknown>>;
type GlobalHolder = { [GLOBAL_KEY]?: LockTable };

function getTable(): LockTable {
  const holder = globalThis as unknown as GlobalHolder;
  let table = holder[GLOBAL_KEY];
  if (!table) {
    table = new Map();
    holder[GLOBAL_KEY] = table;
  }
  return table;
}

export async function withSessionLock<T>(
  sessionId: string,
  fn: () => Promise<T>,
): Promise<T> {
  const table = getTable();
  const prev = table.get(sessionId) ?? Promise.resolve();

  // Chain onto prev; swallow its rejection so one caller's failure doesn't
  // poison the lock for the next caller.  Our own rejection still surfaces
  // via the returned promise below.
  const run = prev.catch(() => undefined).then(fn);

  // Publish the settled-regardless version so the next waiter never sees a
  // rejection that isn't theirs.
  table.set(sessionId, run.catch(() => undefined));

  return run;
}
