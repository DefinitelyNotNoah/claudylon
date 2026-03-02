/**
 * Polyfill for Symbol.metadata.
 * Required by @colyseus/schema v4 decorators.
 * Node.js does not yet implement this TC39 proposal natively.
 *
 * IMPORTANT: This file must be imported before any @colyseus/schema usage
 * to ensure Symbol.metadata exists when decorators run.
 * @module server/polyfill
 */

(Symbol as any).metadata ??= Symbol.for("Symbol.metadata");
