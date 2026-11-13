/**
 * Outcome of probing `/eSCL/WalkupSubscriptions`:
 * - `supported`: the device implements the walkup extension;
 * - `missing`: the route does not exist (404);
 * - `refused`: the device answers 401/403 (booting, access control, ...);
 * - `unreachable`: any other status or a network error.
 *
 * A const object rather than an enum: the value is internal (never sent over
 * the wire or serialized), and the derived union keeps the closed-set
 * guarantees while giving call sites named constants.
 */
export const EsclWalkupProbe = {
  Supported: "supported",
  Missing: "missing",
  Refused: "refused",
  Unreachable: "unreachable",
} as const;

export type EsclWalkupProbeResult =
  (typeof EsclWalkupProbe)[keyof typeof EsclWalkupProbe];
