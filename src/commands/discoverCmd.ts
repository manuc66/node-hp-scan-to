import axios from "axios";
import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
// default-import + destructure: this dependency is CommonJS and some loaders
// (tsx) do not expose its named exports to ESM consumers
import bonjourService, {
  type Browser as BonjourBrowser,
} from "bonjour-service";

const { Bonjour } = bonjourService;
const execFile = promisify(execFileCb);

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
 * Parse the local ARP cache ("arp -a") into { mac, ip } pairs. Non-invasive:
 * we only ever reach out to addresses already known to the OS, never sweep
 * the whole subnet.
 */
async function getArpCache(): Promise<Array<{ ip: string; mac: string }>> {
  try {
    const { stdout } = await execFile("arp", ["-a"], { timeout: 3000 });
    const entries: Array<{ ip: string; mac: string }> = [];
    for (const line of stdout.split(/\r?\n/)) {
      const m = line.match(
        /\s(\d{1,3}(?:\.\d{1,3}){3})\s+([0-9a-f]{2}(?:-[0-9a-f]{2}){5})\s/i,
      );
      if (m) {
        entries.push({
          ip: m[1],
          // normalise dashes -> colons, lowercase
          mac: m[2].replace(/-/g, ":").toLowerCase(),
        });
      }
    }
    return entries;
  } catch {
    return [];
  }
}

/**
 * Fallback discovery when mDNS finds nothing: inspect the local ARP cache
 * (already-known neighbours only - not a subnet sweep) and probe each host
 * for an HP DiscoveryTree or an eSCL endpoint.
 */
async function scanKnownArpNeighbours(): Promise<DiscoveredDevice[]> {
  const entries = await getArpCache();
  // dedupe by ip; no MAC filtering so non-HP eSCL-only scanners are covered
  const seen = new Set<string>();
  const neighbours = entries.filter((e) => {
    if (seen.has(e.ip)) {
      return false;
    }
    seen.add(e.ip);
    return true;
  });
  console.error(
    `Probing ${neighbours.length} neighbour(s) from the local ARP cache (mDNS found nothing)...`,
  );
  const found: DiscoveredDevice[] = [];
  await Promise.all(
    neighbours.map(async ({ ip }) => {
      const probe = await probeDeviceAndGetName(ip);
      if (probe) {
        found.push(probe);
      }
    }),
  );
  return found;
}

/** probe either HP DiscoveryTree.xml or an eSCL endpoint */
async function probeDeviceAndGetName(
  ip: string,
): Promise<DiscoveredDevice | null> {
  // 1) HP proprietary discovery tree
  try {
    const response = await axios.get<string>(
      `http://${ip}/DevMgmt/DiscoveryTree.xml`,
      { timeout: PROBE_TIMEOUT_MS, responseType: "text" },
    );
    if (response.status === 200 && looksLikeHpScanDevice(response.data)) {
      const name =
        response.data.match(
          /<dd:FriendlyName>([^<]+)<\/dd:FriendlyName>/,
        )?.[1]?.trim() ||
        response.data.match(/<FriendlyName>([^<]+)<\/FriendlyName>/)?.[1]
          ?.trim() ||
        ip;
      return { name, ip };
    }
  } catch {
    // not an HP DiscoveryTree host
  }

  // 2) eSCL scanner capabilities (great for non-HP AirPrint/eSCL scanners)
  try {
    const response = await axios.get<string>(
      `http://${ip}/eSCL/ScannerCapabilities.xml`,
      { timeout: PROBE_TIMEOUT_MS, responseType: "text" },
    );
    if (response.status === 200 && /<Scan:ScannerCapabilities>/.test(response.data)) {
      const name =
        response.data.match(/<dc:modelName>([^<]+)<\/dc:modelName>/)?.[1]
          ?.trim() ||
        response.data.match(/<modelName>([^<]+)<\/modelName>/)?.[1]?.trim() ||
        ip;
      return { name, ip };
    }
  } catch {
    // not an eSCL scanner
  }

  return null;
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

  // mDNS can miss printers that do not answer multicast (VLAN, AP filters);
  // fall back to probing HP neighbours already known to the OS (ARP cache)
  const finalDevices =
    devices.length > 0 || options.name !== undefined
      ? devices
      : (await scanKnownArpNeighbours()).sort((a, b) =>
          a.name.localeCompare(b.name),
        );

  if (finalDevices.length === 0) {
    console.error("No HP scan-capable device found");
    return 1;
  }

  printDevices(finalDevices, options.json);
  return 0;
}
