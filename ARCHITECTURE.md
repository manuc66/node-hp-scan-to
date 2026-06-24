# Architecture Multi-Printer / Multi-Destination

## Objectif

- Supporter N imprimantes simultanément (chacune avec son IP, ses capacités)
- Chaque imprimante peut avoir M targets (ce qui apparaît sur l'écran)
- Chaque target peut router les scans vers plusieurs destinations (local, Paperless, Nextcloud)

---

## 1. Arborescence cible

```
src/
├── index.ts                    # Bootstrap : CLI ou daemon
├── daemon.ts                   # Boucle principale daemon (nouveau)
├── program.ts                  # CLI (conservé pour le mode mono)
│
├── printer/
│   ├── PrinterManager.ts       # Orchestrateur
│   ├── PrinterInstance.ts      # Une imprimante avec ses états
│   └── discovery.ts            # mDNS discovery multi-device
│
├── HPApi.ts                    # REFACTOR: classe instanciable
│   # les dépendants prennent HPApi en paramètre :
│   ├── listening.ts
│   ├── scanProcessing.ts
│   ├── scanJobHandlers.ts
│   ├── readDeviceCapabilities.ts
│   └── commands/*.ts
│
├── destination/
│   ├── types.ts                # Interface Destination
│   ├── router.ts               # Route ScanContent → N destinations
│   ├── local.ts                # Sauvegarde fichier
│   ├── paperless.ts            # (déplacé depuis paperless/paperless.ts)
│   ├── nextcloud.ts            # (déplacé depuis nextcloud/nextcloud.ts)
│   └── pipeline.ts             # Assemble le pipeline format/output
│
├── config/
│   ├── schema.ts               # Nouveau schema Zod nested
│   ├── types.ts                # Types inférés
│   └── default.json
│
├── hpModels/                   # inchangé
├── imageFormats/               # inchangé
├── PaperSize.ts                # inchangé
├── PathHelper.ts               # inchangé
├── healthcheck.ts              # inchangé
├── postProcessing.ts           # REMPLACÉ par destination/router.ts
├── paperless/                  # DÉPLACÉ vers destination/
├── nextcloud/                  # DÉPLACÉ vers destination/
└── type/                       # simplifié (certains types remontent dans config/)
```

---

## 2. HPApi → instance

**Avant :**
```ts
let printerIP = "192.168.1.11";
let debug = false;
export default class HPApi {
  static setDeviceIP(ip) { printerIP = ip; }
  static getDiscoveryTree() { ... }
}
```

**Après :**
```ts
export default class HPApi {
  readonly deviceIP: string;
  readonly debug: boolean;

  constructor(deviceIP: string, debug = false) { ... }
  async getDiscoveryTree() { ... }
}
```

Toutes les fonctions qui utilisent HPApi reçoivent une instance en paramètre.

---

## 3. PrinterInstance

```ts
class PrinterInstance {
  readonly api: HPApi;
  readonly config: PrinterConfig;
  capabilities: DeviceCapabilities;

  // État de la session listen
  private frontOfDoubleSidedScanContext: FrontOfDoubleSidedScanContext | null = null;
  private lastScanTarget: SelectedScanTarget | undefined;
  private lastDuplexMode: DuplexMode;

  async start(): Promise<void>  // lance listenLoop()
  private async listenLoop(): Promise<void>
}
```

État de l'emulated duplex remonté du closure de listenCmd.ts vers PrinterInstance.

---

## 4. PrinterManager

```ts
class PrinterManager {
  private printers: PrinterInstance[] = [];

  async startAll(): Promise<void>  // Promise.all(printers.map(p => p.start()))
  async stopAll(): Promise<void>

  static async fromConfig(config: DaemonConfig): Promise<PrinterManager>
}
```

Chaque listenLoop tourne en concurrence sur l'event loop.  
libuv multiplexe les I/O HTTP sans thread blocking.  
Pour N printers : N boucles `while(true)` asynchrones, chacune dormant la plupart du temps (long polling HTTP).

---

## 5. Destination routing

```ts
interface Destination {
  readonly type: 'local' | 'paperless' | 'nextcloud';
  send(content: ScanContent, toPdf: boolean): Promise<void>;
}

async function routeScan(
  destinations: Destination[],
  content: ScanContent,
  toPdf: boolean,
): Promise<void> {
  await Promise.allSettled(destinations.map(d => d.send(content, toPdf)));
}
```

Un target peut envoyer vers dossier local + Paperless + Nextcloud en parallèle.

---

## 6. Schéma de config (Zod)

```ts
z.object({
  printers: z.array(z.object({
    name: z.string().optional(),       // mDNS
    ip: z.string().optional(),         // explicite
    defaults: z.object({ ... }).optional(),
    targets: z.array(z.object({
      label: z.string(),
      destinations: z.array(destinationSchema).min(1),
      // duplex, pattern, scan overrides...
    })).min(1),
  })).min(1),
  global: z.object({ ... }).optional(),
})
```

---

## 7. CLI backward compat

Option A (recommandée) :
- Anciennes commandes conservées : `listen`, `adf-autoscan`, `single-scan`, `clear-registrations`
- Nouvelle commande : `node-hp-scan-to daemon --config printers.json`

---

## 8. Diagramme de flux

```
Daemon
├── Lit config (printers.json)
├── PrinterManager.fromConfig(config)
│   ├── mDNS pour les printers sans IP explicite
│   └── Pour chaque printer :
│       ├── new HPApi(ip)
│       ├── readDeviceCapabilities(api)
│       ├── registerWalkupScanDestination(targets)
│       └── start() → listenLoop()
│
├── listenLoop (1 par printer, concurrent) :
│   ├── waitScanEvent() → event
│   ├── waitScanRequest() → user pressed Scan
│   ├── tryGetDestination() → Document/Photo
│   ├── saveScanFromEvent() → ScanContent
│   └── routeScan(destinations, content, toPdf)
│       ├── save local
│       ├── upload Paperless
│       └── upload Nextcloud
│
├── HealthCheck (inchangé)
└── Signal handler (SIGTERM → stopAll())
```

---

## 9. Points sensibles

| Point | Problème | Solution |
|---|---|---|
| Emulated duplex | État en closure dans listenCmd | Le monter dans PrinterInstance |
| callCount debug | Statique | Champ d'instance HPApi |
| Etag polling | État global implicite | Instance porte son propre lastEtag |
| PDF merging concurrent | jsPDF CPU-bound sous charge | Tester + worker_threads si nécessaire |
| Destinations en erreur | Ne pas bloquer les autres | Promise.allSettled() |

---

## 10. Ordre de mise en œuvre

1. **Refactor HPApi → instance** (prérequis à tout)
2. **Schema de config nested**
3. **PrinterInstance + PrinterManager**
4. **DestinationRouter + implémentations**
5. **daemon.ts**
6. **Découverte mDNS multiple**
