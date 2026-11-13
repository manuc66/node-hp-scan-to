import type { ScanJobContext, ScanJobHandler } from "./ScanJobHandler.js";
import { HpScanJobHandler } from "./HpScanJobHandler.js";
import { EsclScanJobHandler } from "./EsclScanJobHandler.js";

/**
 * Instantiate the scan job implementation matching the device protocol.
 * The rest of the code only talks to the ScanJobHandler contract.
 */
export function createScanJobHandler(
  isEscl: boolean,
  context: ScanJobContext,
): ScanJobHandler {
  return isEscl
    ? new EsclScanJobHandler(context)
    : new HpScanJobHandler(context);
}
