# Spec: Regression-Wächter in `sync publish`, `x` aus der Blossom-URL, Blossom-URLs in Git

**Datum:** 2026-09-07
**Status:** Entwurf
**Bezug:** `2026-09-04-bilder-und-pull.md` (ändert dessen Teil A, lässt B und C
unberührt) · `community-hub/docs/entscheidungen/0013`, `0021`, `0022` ·
`community-hub/docs/redaktion-longform.md` ·
`FOERBICO_und_rpi-virtuell/Orga/…/wissensgrundlagen/felder.yaml`,
`bildattribution.md` · `content-lint` · edufeeds eigene Beschreibung des
1063-Mechanismus (Wiki, kind 30818, 2026-09-07):
`nostr:naddr1qvzqqqrcvgpzp0wzr7fmrcktw4sgemxh5zsq5auh08vnvlwf0x9anusn7pkft0zgqyv8wumn8ghj7un9d3shjtn9v36kvet9vshx7un89uqpxmrfvdjkuum994jhvetww3ej6mn0wpjswuu6gy`

## Warum

Am 2026-09-07 um 11:36 hat ein `publish`-Lauf den Referenzbeitrag
`die-kraft-der-gemeinschaft` neu geschrieben und dabei die Fassung vom 03.09.
verdrängt — die einzige im Bestand mit Blossom-Cover, `x`-Tag und auflösbarem
`kind:1063`. Der Hub zeigte danach wieder ein WordPress-Bild ohne Nachweis.

Drei Tatsachen machen das zum Regelfall, nicht zum Unfall:

1. **`sync` kann kein `x`-Tag erzeugen.** `events/article.ts` kennt genau eine
   Bildstelle: `if (metadata.image) tags.push(['image', metadata.image])`.
   Die gute Fassung stammte aus einem anderen Werkzeug; jeder `sync`-Lauf
   musste sie überschreiben.
2. **Das Frontmatter in Git trägt den alten Stand.** `image:` zeigt auf
   `oer.community`, `cover.relative: true` — unverändert seit 20. Mai.
   `publish` hat korrekt publiziert, was in Git steht.
3. **Das Git-Bild ist nicht der attestierte Blob.** `nosTr-schrein.jpg` im
   Bundle hat 146 795 B, der Blob hinter `a2a54ea5…` 146 385 B. Wer das
   lokale Bild hasht, bekommt einen Hash ohne Nachweis.

`kind:30023` ist ersetzbar: Wer zuletzt schreibt, gewinnt, der Rest ist weg.
Solange zwei Wege auf denselben Key schreiben können, wiederholt sich das
mit jedem Beitrag, den jemand außerhalb von Git verbessert.

## Grundsatz: ein Schreiber je Beitrag

- **Git-first:** Nur `sync publish` schreibt das 30023 des FOERBICO-Keys.
  Verbesserungen gehen durch Git — auch Bild-URLs. Was nur auf dem Relay
  steht, hält der Wächter zwar fest (der Post wird zurückgehalten), aber es
  bleibt stecken, bis jemand Git nachzieht. Der Weg nach vorn führt immer
  durch das Repository.
- **Nostr-first, je Beitrag:** `source: relay` im Frontmatter (Spec
  04.09., Teil B Punkt 7) schaltet einen Beitrag um; `publish` überspringt
  ihn, nur `adopt` (Teil C, ADR-0021) schreibt ihn noch. Kein Stichtag für
  alle 86 — Hugo läuft weiter, weil `pull` das Frontmatter mit
  `cover.relative: false` und Blossom-URL zurückschreibt.
- **Der Wächter** (Teil 1) ist das Sicherheitsnetz für die Zeit, in der
  beide Wege technisch offen sind. Er bleibt danach als allgemeiner Schutz
  gegen Rückschritte jeder Art.

## Teil 1 — Regression-Wächter (`core/regression.ts`, neu)

### Lesehelfer (`core/relays.ts`)

`relays.ts` kann bisher nur schreiben. Neu:

```ts
fetchLatestArticle(relays, pubkey, d, timeoutMs = 8_000)
  → { event: SignedEvent | null, answered: string[], failed: string[] }
```

`{ kinds: [30023], authors: [pubkey], '#d': [d] }` über alle `ARTICLE_RELAYS`
per `relay.req` (Muster aus `subcommands/check.ts`), Ergebnisse zusammen-
geführt, neuestes `created_at` gewinnt, bei Gleichstand die kleinste `id`
(wie `nachweisAusEvents` im Hub). Wer nicht
innerhalb `timeoutMs` antwortet, steht in `failed`.

### Die drei Fortschrittsmarker

Ein Marker ist **Rückschritt**, wenn die Relay-Fassung ihn hat und der
Kandidat nicht (bzw. weniger):

| Nr | Marker | Prüfung |
|---|---|---|
| 1 | Menge der `x`-Tags am Artikel | kein Hash der Relay-Fassung darf fehlen |
| 2 | `image`-Tag ist Hash-URL | Pfad endet auf `/[0-9a-f]{64}(\.[a-z0-9]+)?` |
| 3 | Hash-URLs im `content` | Anzahl darf nicht sinken |

„Hash-URL" ist bewusst nicht „Blossom-Host": `redaktion-longform.md` (Z. 26)
definiert eine Blossom-URL über den Hash im Pfad. Damit braucht der Wächter
keine Host-Konfiguration und erkennt auch einen künftigen zweiten Server.

### `unchanged`

Sind `tags` (Reihenfolge beachtet) und `content` des Kandidaten identisch
mit der Relay-Fassung — `created_at`, `id` und `sig` bleiben außen vor — → `skipped-unchanged`, kein
Signieren, kein Publish. Verhindert das sinnlose Hochzählen von `created_at`,
das Teil C für `adopt` ohnehin fordert.

### Verhalten

| Lage | Ergebnis |
|---|---|
| Rückschritt, kein `--allow-regression` | `skipped-regression`, `reason` nennt die Marker. Kein Sign, kein Publish. Andere Posts laufen weiter. |
| Rückschritt, `--allow-regression` | publizieren; Summary listet den Post unter „bewusst überschrieben". |
| Identisch | `skipped-unchanged` |
| ≥ 1 Relay geantwortet, kein Event | Erstveröffentlichung, normal. |
| **Kein** Relay geantwortet | **publizieren**, `reason: 'ohne Vergleichsbasis: <failed>'`, Summary-Warnung. Ein flackerndes Relay hält die Pipeline nicht auf; `MIN_RELAY_ACKS=2` fängt den Fall ab, dass nichts erreichbar ist. |

**Restrisiko, bewusst getragen:** Antworten nur manche Relays, kann die
reichste Fassung auf einem stummen liegen — der Wächter vergleicht nur mit
dem, was antwortet. Den Vorfall vom 07.09. hätte er gefangen (die gute
Fassung lag auch auf `relay.edufeed.org`); eine von Hand auf **ein** Relay
publizierte Fassung schützt er nicht, wenn genau dieses schweigt. Deshalb
nennt die Summary bei jedem Publish die stummen Relays aus `baseline.failed`
— wer `relay-rpi` dort sieht, weiß, dass der Vergleich unvollständig war.
Der eigentliche Schutz ist der Grundsatz: Fortschritt steht in Git.

Exit-Code bleibt 0 — ein zurückgehaltener Post ist Redaktionsrückstand, kein
Pipeline-Fehler (Regel des Repos). Die Sichtbarkeit kommt aus der Summary.

### Einbau

- `subcommands/publish.ts`: nach dem Bau beider Events (Z. 83/85), **vor**
  der Dry-Run-Rückgabe (Z. 92) — dann zeigt auch `--dry-run` das Ergebnis.
  Der Fetch geht über `deps` hinein (wie `deps.signer`), damit Tests ihn
  ersetzen.
- `PostStatus` += `'skipped-regression' | 'skipped-unchanged'`.
  `PostResult` += `regression?: string[]`, `baseline?: { answered: string[], failed: string[] }`.
- `core/summary.ts`: eigener Block **„Zurückgehalten — Relay-Fassung ist
  reicher"** mit Post und Markern und dem Satz „Git nachziehen oder
  `--allow-regression`"; Warnblock **„Ohne Vergleichsbasis publiziert"**
  mit den stummen Relays. `startsWith('skipped')` zählt beide neuen Stati
  automatisch mit.
- `cli.ts`: Flag `--allow-regression`.
- `nostr-sync.yml` (FOERBICO-Repo): `workflow_dispatch`-Eingabe
  `allow_regression` (boolean, default false) → Flag. `force_all` bleibt
  und ist mit Wächter ungefährlich.

### Tests (`core/regression_test.ts`)

Fetch injiziert wie `fakeRunner` in `change-detection_test.ts`.

- je Marker: Relay hat, Kandidat nicht → `skipped-regression` mit genau
  diesem Marker; Kandidat hat mehr → kein Rückschritt
- Marker 3: Anzahl sinkt → Rückschritt; steigt oder gleich → nicht
- identisch bis auf `created_at` → `skipped-unchanged`
- kein Event, ein Relay antwortet → publizieren ohne `reason`
- kein Relay antwortet → publizieren, `reason` nennt alle Relays
- `--allow-regression` → publizieren, `regression` bleibt gefüllt
- zwei Relays, zwei Fassungen → neueste zählt; Gleichstand → kleinere `id`
- Dry-Run zeigt `skipped-regression`

## Teil 2 — `x` für das Cover und je Fließtextbild (`events/article.ts`)

**Cover:** Endet `metadata.image` auf `/<64 hex>(.<ext>)?`, folgt
**unmittelbar** auf `['image', url]` ein `['x', hash]`. Reihenfolge wie
`md2blossom` (Z. 149) und ADR-0013. Ohne dieses Tag kann Git keinen
Fortschritt tragen: Der Hub fragt ohne `x` kein Relay.

**Fließtextbilder:** Je Bild-URL im Body mit Hash im Pfad ein weiteres
`['x', hash]` — dedupliziert, das Cover nicht doppelt (der Referenzfall zeigt
das Cover im Text noch einmal: ein `x`). So hat edufeed es am 07.09.
vorgeschlagen („die Hashes der Bilder mit einem x-Tag kennzeichnen und für
jeden Hash ein Lizenz-Event"); `imeta` entfällt damit. Was der Konverter
schreibt, leitet er aus den URLs ab — die Autorin setzt nur die URL.

**Konvention: Das erste `x` gehört zum Cover.** edufeeds `ArticleView` und
`hub/models/artikel.js` lesen das erste `x` als Cover-Hash; mit mehreren
`x` wird das zur Vereinbarung, die beide Editoren einhalten müssen.
(Nachgefragt bei edufeed, 07.09.)

**Bindung im Text:** Welches `x` zu welchem Bild gehört, liest der Leser
bei Blossom-URLs aus dem Pfad, bei fremden URLs (Bibliotheks-Picker:
Openverse, Unsplash, Wikimedia Commons, ARASAAC) über den `url`-Tag des
1063, das der Picker mit der Original-URL prägt. Kein Download beim Lesen.

Kein `x` bei URLs ohne Hash — ein erratener Hash wäre schlimmer als keiner.
Für fremde URLs kann `sync` den Hash nur durch einmaliges Laden beim
Publizieren gewinnen (siehe „Offen").

**30142 (`events/amb.ts`):** edufeed setzt dort ebenfalls `x` (belegt am
Caesar-Fall). Ob `sync` folgt, ist zu entscheiden — siehe „Offen".

### Tests (`events/article_test.ts`)

- Blossom-URL → `x` vorhanden, direkt nach `image`, Wert = 64 hex
- `oer.community`-URL → kein `x`
- kein `image` → kein `image`, kein `x`
- Endung `.jpeg` und `.jpg` und ohne Endung → jeweils erkannt
- Fließtextbild mit Hash-URL → zweites `x` nach dem Cover-`x`
- Textbild = Cover → genau ein `x`; gleiches Bild zweimal → ein `x`
- fremde und relative Bild-URLs → kein `x`; Großbuchstaben normalisiert
- Text-`x` stehen vor `about`, `t`, `a`; kein `imeta`

## Teil 3 — Blossom-URLs in Git (ersetzt Teil A, „Konvention", der Spec vom 04.09.)

Teil A legte fest: „Bilder bleiben relativ im Git. Die Umschreibung passiert
nur im Event, nie in `index.md`." Das wird zurückgenommen. **Git trägt die
Blossom-URLs selbst.** Gründe: `commonMetadata.image` ist dann wahr statt
totes Feld; `foerbico-editor` und `md2blossom` erzeugen diese Form bereits;
der Wächter kann Fortschritt nur schützen, der in Git steht. Teil A wird
nicht falsch, nur später — als Automatisierung dessen, was `md2blossom`
heute je Post von Hand macht.

### Zielform je Post

```yaml
# commonMetadata
image: https://blossom.edufeed.org/<sha256>.jpeg

# staticSiteGenerator
cover:
  relative: false
  image: https://blossom.edufeed.org/<sha256>.jpeg
  alt: …
  hiddenInSingle: true
```

Body: Blossom-URLs mit TULLU-Zeile, wie `md2blossom` sie schreibt. Die
lokale Bilddatei bleibt im Bundle (Hugo braucht sie nicht mehr, Git behält
das Original).

### Bildmetadaten im Frontmatter — Eingabe, nicht Wahrheit

Der Nachweis lebt als `kind:1063` auf dem Relay, adressiert über den Hash —
so ist es auf Nostr gelöst, und Teil A der Spec vom 04.09. sagt es in
Schritt 3 schon: Treffer → vorhandenen Nachweis nehmen, die Eingabe gewinnt
nicht. **Kein `bilder.yaml`.** Die Bildmetadaten stehen als dritter
markierter Block im Frontmatter von `index.md`, nach demselben Muster wie
`# commonMetadata` und `# staticSiteGenerator` — eine Datei, die der Editor
ohnehin schreibt, `felder.yaml` ohnehin dokumentiert und Hugo ignoriert:

```yaml
# bilder  (Konvention: bildattribution.md · Schlüssel = Dateiname oder Hash-URL)
bilder:
  nosTr-schrein.jpg:
    alt: Darstellung eines Schreins als Sinnbild zyklischer Erneuerung
    title: nosTr-schrein
    author: Comenius-Institut
    licenceUrl: https://creativecommons.org/publicdomain/zero/1.0/
```

**Der Block ist Eingabe, das 1063 auf dem Relay ist Wahrheit.** Anders als
eine löschbare Zusatzdatei bleibt Frontmatter — Lizenzdaten stehen damit
dauerhaft in Git *und* im Event. Deshalb gilt ausdrücklich: Bei Abweichung
gewinnt das Relay, der Konverter warnt; `pull` (Teil B) schreibt den Block
aus dem 1063 zurück. Was Git für die Auflösung braucht, ist allein die
Hash-URL — der Block dient dem Prägen und dem Alt-Text.

Zwei Wege zum selben 1063:

- **Editor** (edufeed-app, `foerbico-editor`): Upload, Lizenzdialog, Nachweis
  sofort geprägt, `index.md` kommt mit Blossom-URL und `bilder`-Block heraus
  — eine zweite Datei entfällt. Der Weg für neue Beiträge
  (`redaktion-longform.md` §3.2).
- **`bilder`-Block + `md2blossom`**: für den Altbestand, wo niemand 85 Posts
  durch einen Dialog klickt und CI ohne Oberfläche prägen soll.

**Feldnamen sind die der Konvention** (`bildattribution.md`), nicht die
1063-Tags — Menschen schreiben den Block, und sie kennen `author`,
`licenceUrl`, `sourceUrl`. Der Konverter bildet ab:

| `bilder`-Block (Konvention) | 1063-Tag |
|---|---|
| `title` | `title` |
| `author` | `credit` |
| `authorUrl` | `authorUrl` — Zusatz-Tag außerhalb NIP-94, wie der Editor |
| `licenceUrl` | `license` |
| `licence` | — (Kürzel wird aus der URL abgeleitet) |
| `sourceUrl` | `source` |
| `modification` | `modification` — Zusatz-Tag, wie der Editor |
| `alt` | `alt` |
| `pubkey` | `p` |

Die rechte Spalte ist edufeeds Vertrag, seit dem 07.09. von edufeed selbst
dokumentiert (Wiki `license-events-nope`, siehe Bezug): Pflicht `url`, `x`,
`m`, `license`, `credit`; optional `size`, `dim`, `alt`, `image`, `title`,
`source`, `p`; newest-wins, Gleichstand kleinste `id`. Nicht im Wiki, aber
im Code: **beim Lesen genügt `license`** (`ImageLicenseOverlay`), und
Fließtextbilder lösen den Hash aus der Blossom-URL (`getSha256FromURL`).
`authorUrl`/`modification` sind FOERBICOs Erweiterung; edufeed ignoriert
unbekannte Tags.

**Ableitbares steht nicht im Block.** `url`, `x`, `m`, `size`, `dim` rechnet
der Konverter aus der Datei — für das 1063 und die `x`-Tags am Artikel.
Der Block trägt nur, was ein Mensch wissen muss.
**Schlüssel** ist der Dateiname (wird gehasht) **oder** eine Hash-URL (wird
übernommen, nicht gehasht) — dieselbe Regel wie Punkt 2 unten; sie löst den
Referenzpost, dessen lokales JPG nicht der attestierte Blob ist.

**Parser-Folgen.** `mdparser/core/parser.ts` schneidet heute bei
`# staticSiteGenerator` ab und liest nur `commonMetadata`; der `# bilder`-Block
ist zusätzlich zu lesen (drei Zeilen). `content-lint` reicht unbekannte
Schlüssel heute durch (`sortByFieldOrder` hängt sie hinten an) — soll den
Block aber kennen und je Eintrag `licenceUrl` als Pflicht prüfen, `alt` als
empfohlen. `md2blossom` liest heute `bilder.yaml` mit 1063-Namen; beides
ist umzustellen. Der `foerbico-editor` schreibt statt `bilder.yaml` den
Block in `index.md` (`frontmatter.js`, `bilderYaml()`).

### `md2blossom.mjs` (FOERBICO-Repo, `Website/scripts/`)

1. **Frontmatter mitschreiben.** Z. 202 schreibt `fm[1]` unverändert; neu:
   `image`, `cover.relative: false`, `cover.image` auf die Cover-URL setzen.
2. **Bestehende Hash-URL respektieren.** Steht in `image` bereits eine
   Hash-URL, wird **nicht** neu gehasht — der Blob dahinter ist attestiert,
   die lokale Datei womöglich ein anderes Encoding (Tatsache 3).
3. **Endung beibehalten.** Z. 96 macht `.jpeg` → `.jpg`. Der attestierte
   Blob und sein 1063 heißen `.jpeg`. Damit `url` im 1063 und `image` am
   Artikel byteidentisch sind: Originalendung behalten. (Blossom liefert
   ohnehin nach Hash, die Endung ist Hinweis.)
4. **Caption nach `bildattribution.md`, nicht nach edufeeds Zeile.** Heute
   baut `tullu()` (Z. 105) `*"Titel", von Credit, [CC…](url), Quelle: …*`
   und setzt eine Leerzeile davor. Die Konvention ist normativ:
   `[title](sourceUrl), [author](authorUrl), [licence](licenceUrl),
   modification` — nur `, ` als Trenner, keine Wörter, **direkt** unter dem
   Bild ohne Leerzeile. Mindestform `[licence](licenceUrl)`. `authorUrl` und
   `modification` gehen zusätzlich als Zusatz-Tags ins 1063, damit der Hub
   sie rendern kann. Inhaltlich bleibt es TULLU; nur die Form ist die eigene.
5. **`bilder`-Block statt `bilder.yaml`.** Lizenzdaten aus dem Frontmatter
   lesen (Konventionsnamen, Abbildung oben), `TODO:LICENSE` wie bisher für
   Bilder ohne Eintrag. Beim Rückschreiben (`--write`) den Block erhalten.

### `felder.yaml`

- Neuer Block `bilder` (Schlüssel Dateiname oder Hash-URL; Felder nach
  `bildattribution.md`: `alt`, `title`, `author`, `authorUrl`, `licenceUrl`,
  `sourceUrl`, `modification`, `pubkey`). Pflicht je Eintrag: `licenceUrl`.
  **Mit der Wahrheitsregel im Kommentar:** Eingabe zum Prägen; existiert ein
  1063 zum Hash, gilt das Relay.
- `image.muster`: zusätzlich `https://blossom.edufeed.org/{sha256}.{ext}`.
- `cover.relative`: `wert: true | false` mit Regel — `true` ⇒ `cover.image`
  ist Dateiname im Bundle; `false` ⇒ `cover.image` ist Hash-URL und
  identisch mit `commonMetadata.image`. Der Kommentar in Z. 148–149 sagt
  das schon, die Regel `wert: true` widerspricht ihm.
- `cover.image.format`: Dateiname **oder** Hash-URL bei `relative: false`.

### `content-lint`

- `validate.ts:313`: Hash-URL als zweites gültiges Muster.
- C06 (Z. 522): bleibt — bei `relative: false` sind beide Strings gleich,
  `endsWith` gilt.
- C07 (Z. 535): `relative: false` erlaubt, **wenn** `cover.image` Hash-URL
  ist und `image` gleicht; sonst weiter Fehler.
- **`fix.ts:27` darf Hash-URLs nicht anfassen.** Der Autofix schreibt `image`
  auf das `oer.community`-Präfix zurück — derselbe Rückschritt wie am
  07.09., nur im Linter. Ohne diese Sperre macht ein `lint --fix` die
  Migration rückgängig.

### Hugo

PaperMod verwendet bei `relative: false` die URL unverändert, ohne
Bildverarbeitung. **Das ist am Referenzpost mit `hugo` zu prüfen, nicht
anzunehmen** — das Theme liegt als Submodul vor und war lokal nicht
ausgecheckt.

### Nachweise signieren

`md2blossom` schreibt unsignierte 1063-Vorlagen und signiert nicht (kein
Key im Skript). Wer publiziert sie in der Migration? Siehe „Offen".

### Dokumente nachziehen

- Spec 04.09., Teil A, Absatz „Konvention im Content-Repo": Verweis hierher.
- `bildattribution.md`: Abschnitt zum `bilder`-Block mit der
  Abbildungstabelle oben. Heute nennt die Konvention weder den Block noch
  die 1063-Tags — und der `foerbico-editor` lädt die Wissensgrundlagen zur
  Laufzeit.
- `foerbico-editor/README.md`: Ausgang 1 ist nur noch `index.md`.
- `redaktion-longform.md` Z. 52 („`image` wird als oer.community-URL
  durchgereicht") beschreibt dann den alten Zustand.
- `mdparser/CLAUDE.md`: „Bilder werden weiter unter `oer.community`-URLs
  referenziert" streichen; Wächter und `x`-Ableitung unter „Wichtige Regeln".

## Reihenfolge

1. **Teil 1 + 2** in `mdparser` (TDD), Action-Eingabe. Ab hier ist
   `--force-all` ungefährlich und jeder Rückschritt sichtbar.
2. **`felder.yaml` + `content-lint`** — sonst wertet der Linter den ersten
   migrierten Post rot und `fix` macht ihn rückgängig.
3. **Referenzpost von Hand:** `image` und `cover` auf
   `…/a2a54ea54f386ba0abceb4d28498c4c5c0b66da153bdec04c36bf40a6c32bf5b.jpeg`,
   `relative: false`. Commit, `publish`, Hub zeigt das Bild mit
   TULLU-Zeile. **Das ist der Beweis, dass die Kette Git → Event → Hub
   wieder schließt.** Hugo-Build prüfen.
4. **`md2blossom` erweitern** (Teil 3), dann Posts Stück für Stück.
5. Teil A/B/C der Spec vom 04.09. danach unverändert — A als
   Automatisierung von Schritt 4.

Das sind **zwei Implementierungspläne**: Schritt 1 (Teil 1 + 2, nur
`mdparser`) und Schritte 2–4 (Teil 3, über `FOERBICO_und_rpi-virtuell`,
`content-lint` und `mdparser`). Der erste ist für sich allein wertvoll und
blockiert nicht auf den zweiten.

## Woran wir merken, dass es falsch war

- **Der Wächter hält zu oft legitime Änderungen zurück** — etwa das bewusste
  Entfernen eines Bildes. Dafür gibt es `--allow-regression`; wird es zur
  Gewohnheit, sind die Marker zu grob und brauchen eine Ausnahme-Angabe im
  Frontmatter statt eines globalen Schalters.
- **Hugo rendert externe Cover schlecht** (keine Größenvarianten, kein
  Lazy-Load). Dann bleibt die lokale Datei für Hugo, und nur
  `commonMetadata.image` trägt die Blossom-URL — `cover.relative` bliebe
  `true`. Dann ist `content-lint` C06 („`image` endet mit `cover.image`")
  anzupassen, weil Hash-URL und Dateiname nicht mehr zusammenpassen. Der
  Wächter und Teil 2 sind davon unberührt.
- **`unchanged` verhindert ein gewolltes Re-Publish** (z. B. nach
  Relay-Verlust). Dann ein Flag `--republish`, das nur `unchanged` aufhebt.

## Aufwand

Teil 1 + 2: ein halber Tag inkl. Tests. Teil 3 (`md2blossom`, `felder.yaml`,
`content-lint`): ein halber Tag. Migration der Posts: Redaktionsarbeit, je
Post Minuten, sobald Nachweise signiert werden können.

## Offen

- **~~`imeta` je Fließtextbild~~ — erledigt 07.09.:** edufeed hat sich für
  wiederholte `x`-Tags entschieden (Teil 2). `imeta` hätte `url` und `alt`
  je Bild gebunden, wird aber von Relays nicht indexiert; `x` ist
  indexierbar, die Bindung läuft über den Pfad bzw. `1063.url`. Ein
  Nebeneffekt bleibt: Der Alt-Text hat im Event keinen Platz je Verwendung
  — er steht im Markdown, und das genügt dem Hub.
- **Fremde Bild-URLs in Git-first.** Der Bibliotheks-Picker in edufeed prägt
  das 1063 mit der Original-URL und kennt den Hash beim Einfügen. Kommt eine
  fremde URL dagegen über Git, muss `sync` die Datei **einmal beim
  Publizieren** laden und hashen (CI, nicht Leser) — dann `x` schreiben und
  das 1063 suchen oder aus dem `bilder`-Block prägen. Das ist der
  Rückwärts-Lookup, den ADR-0015 für die Leseseite verwarf; für die
  Schreibseite ist er richtig. Damit kämen auch die 25 fremden Bilder der
  10 Altbeiträge zurück, sobald ihre Lizenz bekannt ist.
- **KI-Bilder im 1063.** NIP-94 hat kein Herkunftsfeld; die
  Transparenzpflichten der KI-Verordnung (Art. 50) gelten seit 02.08.2026.
  Kandidat: IPTC `digitalSourceType` (auch C2PA nutzt es —
  `trainedAlgorithmicMedia`, `compositeWithTrainedAlgorithmicMedia`,
  `algorithmicallyEnhanced`, …) als Tag am 1063 und Feld in
  `bildattribution.md`, dazu das Werkzeug (`generator`). Eigene
  Entscheidung, mit edufeed abzustimmen — betrifft Editor, `md2blossom`,
  Hub-Attribution und die Konvention.
- **1063-Signieren in der Migration.** Drei Wege: (a) `foerbico-editor` je
  Post (existiert, NIP-46, langsam bei 85 Posts); (b) neues
  `sync attest <datei.1063.json>` — signiert mit dem FOERBICO-Bunker und
  publiziert an `relay-rpi`, ~50 Zeilen, alles vorhanden; (c) Teil A der
  Spec vom 04.09. vorziehen. Empfehlung: (b) — kleinster Schritt, der die
  Migration nicht an den Editor kettet.
- **`x` im 30142:** edufeed setzt es. Folgen oder nicht? Der Hub braucht es
  nicht, AMB-Konsumenten könnten es nutzen.
- **Exit-Code bei Rückschritt:** 0 (Regel des Repos) oder `::warning::`-
  Annotation zusätzlich, damit es im Actions-Lauf ohne Summary-Öffnen
  auffällt.
