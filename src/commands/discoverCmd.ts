import axios from "axios";
// default-import + destructure: this dependency is CommonJS and some loaders
// (tsx) do not expose its named exports to ESM consumers
import bonjourService, {
  type Browser as BonjourBrowser,
} from "bonjour-service";

const { Bonjour } = bonjourService;

export interface DiscoveredDevice {
  name: string;
  ip: string;
}

export interface DiscoverOptions {
  timeoutSeconds: number;
  json: boolean;
  ip?: string;
  name?: string;
}

const MDNS_SERVICE_TYPES = ["http", "uscan", "uscans", "ipp", "printer"];
const PROBE_TIMEOUT_MS = 2000;

/**
 * Cheap structural check on the HP proprietary DiscoveryTree document:
 * only scan-capable devices expose a WalkupScanToComp and/or an eSCL manifest.
 */
export function looksLikeHpScanDevice(discoveryTreeXml: string): boolean {
  return (
    discoveryTreeXml.includes("WalkupScanToCompManifest") ||
    discoveryTreeXml.includes("eSclManifest")
  );
}

async function probeDevice(ip: string): Promise<boolean> {
  try {
    // ip may embed an explicit port (host:port), handy for tests
    const response = await axios.get<string>(
      `http://${ip}/DevMgmt/DiscoveryTree.xml`,
      { timeout: PROBE_TIMEOUT_MS, responseType: "text" },
    );
    return response.status === 200 && looksLikeHpScanDevice(response.data);
  } catch {
    return false;
  }
}

/**
 * Browse mDNS for candidate devices during the given duration.
 * Plain `_http._tcp` alone would return every web-enabled gadget on the
 * network, so several printer-flavoured service types are watched too.
 */
function browseCandidates(timeoutMs: number): Promise<DiscoveredDevice[]> {
  return new Promise((resolve) => {
    const bonjour = new Bonjour();
    const candidates = new Map<string, DiscoveredDevice>();
    let done = false;

    const finish = () => {
      if (done) {
        return;
      }
      done = true;
      bonjour.destroy();
      resolve([...candidates.values()]);
    };

    const browsers: BonjourBrowser[] = [];
    const startAll = () => {
      for (const browser of browsers) {
        browser.start();
      }
    };
    const stopAllThenRestart = () => {
      // cold mDNS caches / sleeping devices often miss the very first
      // multicast query; re-issuing it midway makes discovery reliable
      for (const browser of browsers) {
        browser.stop();
      }
      startAll();
    };

    for (const type of MDNS_SERVICE_TYPES) {
      const browser = bonjour.find({ type }, (service) => {
        const ipv4 = service.addresses?.find((address) =>
          /^\d+\.\d+\.\d+\.\d+$/.test(address),
        );
        if (ipv4 === undefined || service.port !== 80) {
          return;
        }
        if (!candidates.has(ipv4)) {
          candidates.set(ipv4, { name: service.name, ip: ipv4 });
        }
      });
      browsers.push(browser);
    }

    startAll();
    const requeryAt = Math.min(timeoutMs / 2, 3000);
    const requeryTimer = setTimeout(stopAllThenRestart, requeryAt);
    requeryTimer.unref();
    const timer = setTimeout(finish, timeoutMs);
    timer.unref();
  });
}

function printDevices(devices: DiscoveredDevice[], json: boolean) {
  if (json) {
    console.log(JSON.stringify(devices, null, 2));
    return;
  }
  for (const device of devices) {
    console.log(`${device.name}\t${device.ip}`);
  }
}

export async function discoverCmd(options: DiscoverOptions): Promise<number> {
  // progress chatter goes to stderr so that stdout stays machine-readable
  if (options.ip !== undefined) {
    const isValid = await probeDevice(options.ip);
    if (!isValid) {
      console.error(`No HP scan-capable device found at ${options.ip}`);
      return 1;
    }
    printDevices([{ name: options.ip, ip: options.ip }], options.json);
    return 0;
  }

  console.error("Searching for HP scan-capable devices...");
  let candidates = await browseCandidates(options.timeoutSeconds * 1000);

  if (options.name !== undefined) {
    const prefix = options.name.toLowerCase();
    candidates = candidates.filter((device) =>
      device.name.toLowerCase().startsWith(prefix),
    );
  }

  console.error(`Probing ${candidates.length} candidate(s)...`);
  const checks = await Promise.all(
    candidates.map((candidate) => probeDevice(candidate.ip)),
  );
  const devices = candidates.filter((_, index) => checks[index]);
  devices.sort((a, b) => a.name.localeCompare(b.name));

  if (devices.length === 0) {
    console.error("No HP scan-capable device found");
    return 1;
  }

  printDevices(devices, options.json);
  return 0;
}
