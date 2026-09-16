/**
 * A ~100-line test harness. Deliberately dependency-free: the whole point of
 * this project is that a sceptical reader can open every file and check it
 * without installing anything.
 */

const suites = [];
let current = null;

export function suite(name, fn) {
  current = { name, tests: [] };
  suites.push(current);
  fn();
  current = null;
}

export function test(name, fn) {
  if (!current) throw new Error('test() called outside suite()');
  current.tests.push({ name, fn });
}

class AssertionError extends Error {}

function fail(message) {
  throw new AssertionError(message);
}

/** Strict truthiness. */
export function assert(condition, message = 'expected truthy') {
  if (!condition) fail(message);
}

/** Exact equality, for integers and identities. */
export function equal(actual, expected, message = '') {
  if (actual !== expected) {
    fail(`${message}\n    expected: ${expected}\n    actual:   ${actual}`);
  }
}

/**
 * Absolute tolerance. Use when the tolerance itself is physically meaningful,
 * e.g. "within 0.01 degrees".
 */
export function approx(actual, expected, tol, message = '') {
  const diff = Math.abs(actual - expected);
  if (!(diff <= tol)) {
    fail(`${message}\n    expected: ${expected} +- ${tol}` +
         `\n    actual:   ${actual}\n    diff:     ${diff}`);
  }
}

/** Relative tolerance. Use when comparing two derivations of the same number. */
export function approxRel(actual, expected, relTol, message = '') {
  const denom = Math.abs(expected) || 1;
  const rel = Math.abs(actual - expected) / denom;
  if (!(rel <= relTol)) {
    fail(`${message}\n    expected: ${expected} (rel tol ${relTol})` +
         `\n    actual:   ${actual}\n    rel diff: ${rel.toExponential(3)}`);
  }
}

export function lessThan(actual, bound, message = '') {
  if (!(actual < bound)) fail(`${message}\n    expected < ${bound}, got ${actual}`);
}

export function greaterThan(actual, bound, message = '') {
  if (!(actual > bound)) fail(`${message}\n    expected > ${bound}, got ${actual}`);
}

export function between(actual, lo, hi, message = '') {
  if (!(actual >= lo && actual <= hi)) {
    fail(`${message}\n    expected in [${lo}, ${hi}], got ${actual}`);
  }
}

/** Values a test wants to report even when it passes. */
let notes = [];
export function note(label, value) {
  notes.push({ label, value });
}

/** Run everything. Returns a plain results object, printable anywhere. */
export function run() {
  const results = [];
  let passed = 0, failed = 0;

  for (const s of suites) {
    const suiteResult = { name: s.name, tests: [] };
    for (const t of s.tests) {
      notes = [];
      try {
        t.fn();
        suiteResult.tests.push({ name: t.name, ok: true, notes });
        passed++;
      } catch (err) {
        suiteResult.tests.push({
          name: t.name,
          ok: false,
          error: err instanceof AssertionError ? err.message : `${err.stack || err}`,
          notes,
        });
        failed++;
      }
    }
    results.push(suiteResult);
  }
  return { results, passed, failed, total: passed + failed };
}
