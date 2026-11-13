import { describe, it } from "mocha";
import { expect } from "chai";
import type DeviceClient from "../src/DeviceClient.js";
import type { DeviceCapabilities } from "../src/type/DeviceCapabilities.js";
import type { ScanListener } from "../src/scanListeners/ScanListener.js";
import { createScanListener } from "../src/scanListeners/createScanListener.js";

const configs = [{ label: "Paperless", isDuplexSingleSide: false }];

describe("createScanListener", () => {
  const api = {} as DeviceClient;

  function capabilities(
    factory: DeviceCapabilities["createWalkupScanListener"],
  ): DeviceCapabilities {
    return {
      createWalkupScanListener: factory,
      userActionTimeout: null,
    } as DeviceCapabilities;
  }

  it("uses the listener factory resolved from the device capabilities", () => {
    const listener = {} as ScanListener;
    let receivedApi: DeviceClient | undefined;
    let receivedConfigs: typeof configs | undefined;

    const created = createScanListener(
      api,
      capabilities((listenerApi, registrationConfigs) => {
        receivedApi = listenerApi;
        receivedConfigs = registrationConfigs;
        return listener;
      }),
      configs,
    );

    expect(created).to.equal(listener);
    expect(receivedApi).to.equal(api);
    expect(receivedConfigs).to.equal(configs);
  });

  it("refuses listen when the device has no walkup support", () => {
    expect(() => createScanListener(api, capabilities(null), configs)).to.throw(
      /not scan-to-computer/,
    );
  });
});
