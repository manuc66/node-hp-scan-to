import { describe, it } from "mocha";
import { expect } from "chai";
import type DeviceClient from "../src/DeviceClient.js";
import { WalkupProtocol } from "../src/type/WalkupProtocol.js";
import type { DeviceCapabilities } from "../src/type/DeviceCapabilities.js";
import { createScanListener } from "../src/scanListeners/createScanListener.js";
import EsclWalkupScanListener from "../src/scanListeners/EsclWalkupScanListener.js";
import LegacyScanListener from "../src/scanListeners/LegacyScanListener.js";

const configs = [{ label: "Paperless", isDuplexSingleSide: false }];

describe("createScanListener", () => {
  const api = {} as DeviceClient;

  function capabilities(
    walkupProtocol: WalkupProtocol | null,
  ): DeviceCapabilities {
    return {
      walkupProtocol,
      userActionTimeout: null,
    } as DeviceCapabilities;
  }

  it("creates the eSCL listener for EsclWalkup", () => {
    expect(
      createScanListener(api, capabilities(WalkupProtocol.EsclWalkup), configs),
    ).to.be.instanceOf(EsclWalkupScanListener);
  });

  it("creates a WalkupScanToComp listener", () => {
    const listener = createScanListener(
      api,
      capabilities(WalkupProtocol.WalkupScanToComp),
      configs,
    );
    expect(listener).to.be.instanceOf(LegacyScanListener);
  });

  it("creates a WalkupScan listener", () => {
    const listener = createScanListener(
      api,
      capabilities(WalkupProtocol.WalkupScan),
      configs,
    );
    expect(listener).to.be.instanceOf(LegacyScanListener);
  });

  it("falls back to the legacy listener when no protocol is advertised", () => {
    expect(
      createScanListener(api, capabilities(null), configs),
    ).to.be.instanceOf(LegacyScanListener);
  });
});
