# Revue « Autistic » du projet node-hp-scan-to

> Revue exhaustive, techniquement précise — focale sur les implémentations, edge cases, bugs et patterns architecturaux.

---

## 1. Dual Protocol Architecture (HP Propriétaire + eSCL)

**Fichiers clés** : `src/HPApi.ts`, `src/readDeviceCapabilities.ts`, `src/hpModels/`, `src/scanJobHandlers.ts`

Le projet implémente **deux protocoles de scan distincts** en parallèle.

### HP Propriétaire (WalkupScanToComp / WalkupScan / ScanJob)

- **28 classes de modèles XML** dans `src/hpModels/` — chaque endpoint de l'API HTTP du printer a son propre parseur/constructeur XML.
- Découverte via `/DevMgmt/DiscoveryTree.xml` : le discovery tree contient des URIs vers WalkupScanToCompManifest, WalkupScanManifest, ScanJobManifest, EsclManifest.
- Communication HTTP sur le port 80 (walkup*) et 8080 (scan jobs).
- Les pages sont pollées via un Job state machine : `Processing` → `ReadyToUpload` → `Completed`.
- Les jobs HP utilisent un polling avec `waitDeviceUntilItIsReadyToUploadOrCompleted()` (toutes les 300ms).

### eSCL (Mopria / standards)

- Endpoints différents, namespaces XML distincts.
- `EsclScanJobSettings` utilise des unités `ThreeHundredthsOfInches` (1/300 de pouce) pour les ScanRegions.
- Détection automatique via `eSCL:eSclManifest` dans le discovery tree.
- Flag `--prefer-escl` pour forcer eSCL.
- Le polling eSCL est différent : pas de `ReadyToUpload`, on lit directement via `getEsclScanStatus()` et on cherche le job dans la liste des jobs du scanner.

### Problèmes

- **Logique de gestion des jobs dupliquée** entre `hpScanJobHandling()` (l.228-280) et `eSCLScanJobHandling()` (l.344-498) dans `scanJobHandlers.ts`. Les deux parcourent des boucles de polling quasi identiques mais avec des APIs différentes.
- `HPApi` est une classe **statique** — `printerIP`, `debug`, `callCount` sont des variables de module mutables. Cela empêche d'avoir plusieurs instances (impossible de gérer plusieurs printers). Le pattern singleton sauvage tient car il n'y a qu'un seul device à la fois dans l'usage prévu.

---

## 2. Listen Mode & Emulated Duplex State Machine

**Fichier clé** : `src/commands/listenCmd.ts` (449 lignes)

### Architecture du Listen Mode

1. **`waitScanEvent()`** — Long polling sur l'EventTable du device (avec ETag), attend qu'un événement de scan arrive pour un target enregistré.
2. **`waitScanRequest()`** — Une fois l'event reçu, attend que l'utilisateur appuie sur "Scan" sur l'écran du printer. Timeout configurable (défaut 50s).
3. **`tryGetDestination()`** — Récupère la destination (Document/Photo) choisie par l'utilisateur. Polling jusqu'à 20 tentatives avec 1s d'intervalle car l'event peut arriver avant que l'utilisateur ait fini de choisir. Le shortcut devient `null` tant que le choix n'est pas fait.
4. **`saveScanFromEvent()`** — Soumet le job de scan et télécharge les pages.

### Emulated Duplex — Le point le plus complexe du code

Pour les devices sans duplex hardware :

- **Deux targets** sont enregistrés : un normal, un avec `isDuplexSingleSide: true`.
- L'utilisateur scanne le recto → sauvegardé avec `PageCountingStrategy.OddOnly` (pages numérotées 1, 3, 5...).
- L'utilisateur retourne la feuille et scanne via le target duplex → `PageCountingStrategy.EvenOnly` (pages 2, 4, 6...).
- Un `FrontOfDoubleSidedScanContext` stocke l'état entre les deux scans (config, folder, scanJobContent, date, scanToPdf).
- **4 modes d'assemblage** via `DuplexAssemblyMode` :
  - `PAGE_WISE` : [1,3,5] + [2,4,6] → [1,2,3,4,5,6]
  - `DOCUMENT_WISE` : back.reverse() (cas normal — la pile est retournée)
  - `REVERSE_FRONT` : front.reverse() (la pile de rectos a été insérée à l'envers)
  - `REVERSE_BOTH` : les deux sont reversed.

Comportement edge : si l'utilisateur change de target avant d'avoir scanné le verso, `processFinishedPartialDuplexScan()` sauvegarde le scan partiel. La logique de détection :
```
resourceURI identique + mode précédent != BackOfDoubleSided → BackOfDoubleSided
```

L'assemblage `assembleDuplexScan()` est tolérant aux déséquilibres : il calcule `maxLength` et ne push que ce qui existe. Pas de crash si le back a moins de pages.

---

## 3. Image Format Pipeline — Streaming Transforms

**Fichiers** : `src/imageFormats/` (4 implémentations)

### Strategy Pattern

Interface `ImageFormat` avec `save()`, `getExtension()`, `isJpeg()`, `getDeviceFormat()`.

### JPEG (`jpeg.ts`)
- **Passthrough pur** — télécharge directement dans le dossier final. Binaire inchangé. Le plus performant.

### BMP (`bmp.ts`)
- Prend du **Raw** device (RVB non compressé) et le convertit en BMP via un **Transform stream**.
- Gère 3 modes :
  - **Color (24bpp)** : Inversion RGB → BGR dans `encodeRow()`.
  - **Gray (8bpp)** : Copie directe + palette 256 niveaux de gris.
  - **Lineart (1bpp)** : Bits packed MSB-first, inversion optionnelle (`invert`), masquage des bits de padding au-delà de `width`.
- Headers BMP écrits en little-endian. Hauteur négative (top-down DIB).
- Validation : rejette les fichiers > 4 GiB.
- Les rows BMP sont alignés sur 4 bytes (`((bytesPerPixel * width + 3) & ~3)`), le raw device ne l'est pas. Le `BmpRowTransformer` bufferise via `remainder` et alloue un `bmpRow` de taille paddée, puis `fill(0)` pour les bytes de padding.

### PPM (`ppm.ts`)
- Structure quasi identique à BMP. Headers Netpbm : `P6` (couleur), `P5` (gris), `P4` (lineart).
- Pour le lineart : le device HP envoie 1=blanc, P4 attend 1=noir → inversion via `~b & 0xff`.
- Pas de palette (Netpbm n'en a pas).

### Raw (`raw.ts`)
- Passthrough avec extension `.bin` — utile pour debug.

### JPEG Height Fix (`JpegUtil.ts`)
- Résout un problème spécifique aux printers HP en scan ADF : la hauteur déclarée dans le marker JPEG SOF0 est fausse.
- Parcourt les markers JPEG (`FFC0` = SOF0, `FFDC` = DNL) et réécrit la hauteur dans SOF0 à partir de la valeur du DNL.
- Parseur JPEG **maison** (pas de librairie) — implémente la traversée des markers JPEG avec gestion des segments SOS sans taille fixe (`findCurrentBlockSize`).
- Utilisé dans `scanJobHandlers.ts` : `getAndFixHeightWHenAdf()` → `fixJpegHeight()`.

---

## 4. Paper Size Resolution System

**Fichier** : `src/PaperSize.ts` (242 lignes)

Système en plusieurs étages :

1. **`validateAndResolvePaperSize()`** — Rejette les conflits (`paperSize` + `paperDim` mutuellement exclusifs), parse les formats custom (`21x29.7cm`, `8.5x11in`, `210x297mm`), applique l'orientation (portrait/landscape en swapant w/h).
2. **`paperSizeMmToScanRegion()`** — Convertit les mm en unités device (300 DPI pour eSCL, DPI natif pour HP) avec **clamping** aux dimensions max du device.
3. **Vingt-deux presets** : ISO A3-A8, B4-B6, US Letter/Legal/Executive/Statement/Tabloid/Ledger, photo (4×6, 5×7, 8×10, 10×15), business-card, Oficio, Folio.

Validation croisée dans Zod (`src/type/FileConfig.ts`) :
- `paper_size` et `paper_dim` mutuellement exclusifs.
- `paper_size`/`paper_dim` et `width`/`height` mutuellement exclusifs.
- `paper_orientation` nécessite `paper_size`.
- Impossible d'avoir width non-nul et paper_size simultanément.

Edge case : `"max"` est une valeur sentinelle — retourne `null` de `paperSizePresetToMm()`, le caller utilise les dimensions max du device.

---

## 5. Paperless-ngx & Nextcloud Integrations

### Paperless (`src/paperless/paperless.ts`)
- Upload multipart avec token auth.
- **3 modes** configurable via `paperless_group_multi_page_scan_into_a_pdf` et `paperless_always_send_as_pdf_file` :
  1. Images individuelles séparées.
  2. Images converties en PDF puis upload séparé.
  3. PDF fusionné multi-page en un seul document.

### Nextcloud (`src/nextcloud/nextcloud.ts`)
- WebDAV : `PROPFIND` pour vérifier l'existence du dossier, `PUT` pour uploader les fichiers.
- Auth basique (username/password), password lisible depuis un fichier (`nextcloud_password_file`).

### Post-processing (`src/postProcessing.ts`)
- Arbre de décision : `toPdf ? handlePdfPostProcessing : handleImagePostProcessing`.
- Cleanup conditionnel : `keepFiles` (défaut `true`) — supprime les fichiers locaux après upload si false.
- Le cleanup utilise `Promise.all` avec `existsSync` (synchrone dans une fonction async — pas un bug mais incohérence stylistique).

---

## 6. Configuration System

**Fichier** : `src/type/FileConfig.ts` (205 lignes), `config/default.json`

### 3 couches de précédence : CLI flags > Variables d'environnement > Fichier config > Defaults

- Schema Zod **strict** (`z.strictObject()`) — rejette les clés inconnues.
- **superRefine** pour les validations croisées (mutual exclusion paper_size/paper_dim/width/height).
- Preprocessing : les strings `"color"`, `"jpeg"` sont parsées en enum avant validation enum.
- Types inférés : `z.infer<typeof configSchema>` → `FileConfig`.

### Docker
- `root/app.sh` : traduit les variables d'env (IP, NAME, LABEL, PATTERN, RESOLUTION, MODE...) en CLI args.
- s6-overlay pour la supervision des processus (init, signal handling).

---

## 7. HPApi Static Facade — Points d'attention

**Fichier** : `src/HPApi.ts` (694 lignes)

- **Toutes les méthodes sont statiques + variables de module mutables** : `printerIP`, `debug`, `callCount`.
- Débogage : chaque appel HTTP est loggé via `logDebug()` avec un `callId` incrémental, la méthode HTTP, l'URL, les headers req/res.
- **Long polling** : `getEvents()` prend un paramètre `timeout` (1200s en pratique) pour les requêtes ETag — permet de ne pas saturer le printer.
- **Gestion d'erreur** : `wrapCall()` catch les AxiosError, loggue le status, et rethrow. Pas de retry automatisé (responsabilité des appelants via `waitDeviceUp()`).

---

## 8. Testing — Approche et Qualité

~45 fichiers de test, framework Mocha + Chai + nock.

### Points forts
- Tests avec fixtures XML réelles (dans `test/asset/`) — les réponses printer sont mockées au niveau HTTP.
- Tests de transformation image : fichiers `.raw` réels convertis en BMP/PPM et comparés.
- Couverture des edge cases PaperSize : 3 fichiers dédiés (normal, edge-cases, error-handling).
- Tests d'intégration commande : `listenCmd.test.ts` (1327 lignes), `adfAutoscanCmd.test.ts`, `singleScanCmd.test.ts`.
- TypeScript type checking en CI (`tsc --noEmit`).

### Points faibles
- Pas de test avec un vrai printer (difficile, compréhensible).
- Aucun test de performance (téléchargement de pages volumineuses en stream).
- Pas de test de concurrence — le code a des parties potentiellement concurrentes (Promise.all dans cleanup, events asynchrones) mais aucun test ne les couvre.

---

## 9. Problèmes / Paper Cuts Relevés

1. **`src/scanProcessing.ts:53`** : `await new Promise((resolve) => setTimeout(resolve, 1000))` — pas de `delay()` helper utilisé ici alors que le module en exporte un (`src/delay.ts`).

2. **`src/scanJobHandlers.ts:625-627`** : La boucle `while (startNewScanJob)` pour le multi-page platen appelle `waitScanNewPageRequest` avec `deviceCapabilities.userActionTimeout` mais le paramètre est nommé `userActionTimeout` dans la fonction appelée (l.549) alors que c'est un timeout d'attente, pas un timeout d'action utilisateur.

3. **`src/scanJobHandlers.ts:370`** : `const jobLocation = PathHelper.getPathFromHttpLocation(jobUrl)` — appelé 2 fois dans la branche JPEG (l.371, l.381). Appel redondant.

4. **`src/HPApi.ts`** : Classe statique avec état mutable — pas idéal pour les tests (nécessite de réinitialiser l'état entre les tests). Les tests gèrent ça via `beforeEach`, mais c'est une fragilité structurelle.

5. **`src/scanJobHandlers.ts:242-275`** `hpScanJobHandling()` : le `continue` à la l.270 pour `Blocked` est correct mais le comportement diffère subtilement de `Processing` — on repasse par le while check puis par `waitDeviceUntilItIsReadyToUploadOrCompleted`.

6. **`src/commands/listenCmd.ts:56`** : `frontOfDoubleSidedScanContext` initialisé à `null` — variable de closure. Fragile : si le catch ne reset pas ce state après une erreur, un scan duplex partiel serait perdu.

7. **`src/imageFormats/bmp.ts:91-92`** : Commentaires de debug **commentés** (conservation du raw original). Pourquoi pas derrière un flag debug ?

8. **`src/paperless/paperless.ts`** : `paperless_post_document_url` est un `z.string().optional()` — pas de validation URL (`z.string().url()`).

9. **`src/nextcloud/nextcloud.ts`** : `PROPFIND` avant upload — si le dossier Nextcloud n'existe pas, ça throw sans tenter de le créer. L'utilisateur doit le créer manuellement.

10. **`protocol_doc/`** : Documentation reverse-engineered du protocole HP (1671 lignes). Présente mais pas utilisée par le code. Utile comme base pour des tests de conformité.
