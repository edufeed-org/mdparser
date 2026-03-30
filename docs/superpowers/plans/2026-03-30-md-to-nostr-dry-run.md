# nostr-sync Dry-Run Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Deno-based sync script that reads local Markdown files (already validated by content-lint), builds Kind 30023 + Kind 30142 Nostr events (for articles AND images), and outputs them as JSON in dry-run mode.

**Architecture:** Modular Deno TypeScript — parser extracts YAML frontmatter, validator does minimal sanity checks (content-lint is responsible for thorough validation), separate event builders for 30023 (articles), 30142 (article AMB), and 30142 (image AMB). Orchestrator reads local files, discovers image sidecars, and pipes through the pipeline. No network access needed for dry-run. Follows wp-to-nostr patterns (env vars, `deno task` commands).

**Tech Stack:** Deno, TypeScript, `npm:yaml` for YAML parsing, `npm:nostr-tools` for event structure validation.

**Prerequisite:** Content has been validated by `content-lint` (separate repo). This script trusts that YAML is well-formed but skips entries with missing required fields.

---

## File Structure

```
sync/
├── deno.json              # Deno config, tasks, imports
├── config.ts              # Configuration from env vars + defaults
├── discover.ts            # Content + image discovery
├── discover_test.ts       # Tests for discovery
├── parser.ts              # YAML frontmatter extraction (commonMetadata only)
├── parser_test.ts         # Tests for parser
├── images.ts              # Image YAML sidecar parsing
├── images_test.ts         # Tests for image sidecar parsing
├── events/
│   ├── article.ts         # Kind 30023 event builder
│   ├── article_test.ts    # Tests for article events
│   ├── amb.ts             # Kind 30142 event builder (articles)
│   ├── amb_test.ts        # Tests for article AMB events
│   ├── image_amb.ts       # Kind 30142 event builder (images)
│   └── image_amb_test.ts  # Tests for image AMB events
├── sync.ts                # Main orchestrator (dry-run + live)
└── sync_test.ts           # Integration test with fixture files
```

**Test fixtures:**
```
sync/testdata/
├── content/
│   ├── posts/de/2025-09-11-test-artikel/
│   │   ├── index.md                        # Valid post with LearningResource
│   │   ├── cover.jpg                       # Dummy image file
│   │   ├── cover.jpg.yaml                  # Image metadata (CC-BY-SA)
│   │   ├── diagram.png                     # Dummy image without YAML
│   │   ├── ki-bild.png                     # Dummy image
│   │   └── ki-bild.png.yaml               # Image metadata (CC0)
│   ├── posts/en/2025-09-11-test-article-en/
│   │   └── index.md                        # Valid English post
│   ├── impressum/
│   │   └── index.md                        # Page without LearningResource
│   └── missing-fields/
│       └── index.md                        # Invalid: missing required fields
```

---

### Task 1: Deno project setup

**Files:**
- Create: `sync/deno.json`

- [ ] **Step 1: Create deno.json**

```json
{
  "tasks": {
    "sync": "deno run --allow-read --allow-env sync.ts",
    "dry-run": "DRY_RUN=true deno run --allow-read --allow-env sync.ts",
    "test": "deno test --allow-read"
  },
  "imports": {
    "yaml": "npm:yaml@^2.4.5",
    "nostr-tools": "npm:nostr-tools@^2.19.0"
  },
  "compilerOptions": {
    "strict": true
  }
}
```

- [ ] **Step 2: Verify Deno resolves imports**

Run: `cd sync && deno eval "import { parse } from 'yaml'; console.log('yaml ok'); import { finalizeEvent } from 'nostr-tools'; console.log('nostr-tools ok');"`

Expected: Both "ok" messages print without error.

- [ ] **Step 3: Commit**

```bash
git add sync/deno.json
git commit -m "feat(sync): init Deno project with yaml and nostr-tools deps"
```

---

### Task 2: Config module

**Files:**
- Create: `sync/config.ts`

- [ ] **Step 1: Write config.ts**

```typescript
export interface Config {
  pubkey: string;
  contentRelay: string;
  ambRelay: string;
  contentDir: string;
  dryRun: boolean;
}

export function loadConfig(): Config {
  return {
    pubkey: Deno.env.get("NOSTR_PUBKEY") ?? "5a12b41ec15b466321e88c371be2dc47d9193f9c8bba4ab09fc50045bd35aedf",
    contentRelay: Deno.env.get("CONTENT_RELAY") ?? "wss://relay-rpi.edufeed.org/",
    ambRelay: Deno.env.get("AMB_RELAY") ?? "wss://amb-relay.edufeed.org/",
    contentDir: Deno.env.get("CONTENT_DIR") ?? "./content",
    dryRun: Deno.env.get("DRY_RUN") === "true",
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add sync/config.ts
git commit -m "feat(sync): add config module with env var defaults"
```

---

### Task 3: YAML frontmatter parser

**Files:**
- Create: `sync/parser.ts`
- Create: `sync/parser_test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// sync/parser_test.ts
import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { parseMarkdown } from "./parser.ts";

const VALID_MD = `---
# commonMetadata
'@context': https://schema.org/
creativeWorkStatus: Published
type: LearningResource
name: 'Test Artikel'
description: >-
  Ein Testartikel für den Parser.
license: https://creativecommons.org/licenses/by/4.0/deed.de
id: https://oer.community/test-artikel
creator:
  - givenName: Max
    familyName: Mustermann
    id: https://orcid.org/0000-0000-0000-0001
    type: Person
    affiliation:
      name: Test-Uni
      id: https://ror.org/example123
      type: Organization
inLanguage:
  - de
about:
  - https://w3id.org/kim/hochschulfaechersystematik/n052
image: https://oer.community/test-artikel/bild.jpg
learningResourceType:
  - https://w3id.org/kim/hcrt/text
  - https://w3id.org/kim/hcrt/web_page
educationalLevel:
  - https://w3id.org/kim/educationalLevel/level_A
datePublished: '2025-09-11'
keywords:
  - Open Educational Resources (OER)
  - Community

# staticSiteGenerator
author:
  - Max Mustermann
title: 'Test Artikel'
url: test-artikel
tags:
  - Open Educational Resources (OER)
  - Community
---
# Überschrift

Hier ist der Inhalt.
`;

Deno.test("parseMarkdown extracts commonMetadata fields", () => {
  const result = parseMarkdown(VALID_MD);
  assertExists(result);
  assertEquals(result.metadata.name, "Test Artikel");
  assertEquals(result.metadata.id, "https://oer.community/test-artikel");
  assertEquals(result.metadata.type, "LearningResource");
  assertEquals(result.metadata.inLanguage, ["de"]);
  assertEquals(result.metadata.keywords, [
    "Open Educational Resources (OER)",
    "Community",
  ]);
  assertEquals(result.metadata.creator[0].givenName, "Max");
  assertEquals(result.metadata.creator[0].familyName, "Mustermann");
});

Deno.test("parseMarkdown extracts markdown body without frontmatter", () => {
  const result = parseMarkdown(VALID_MD);
  assertExists(result);
  assertEquals(result.content.trim(), "# Überschrift\n\nHier ist der Inhalt.");
});

Deno.test("parseMarkdown ignores staticSiteGenerator block", () => {
  const result = parseMarkdown(VALID_MD);
  assertExists(result);
  assertEquals(result.metadata.author, undefined);
  assertEquals(result.metadata.title, undefined);
  assertEquals(result.metadata.url, undefined);
  assertEquals(result.metadata.tags, undefined);
});

Deno.test("parseMarkdown returns null for file without frontmatter", () => {
  const result = parseMarkdown("# Just a heading\n\nNo frontmatter here.");
  assertEquals(result, null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd sync && deno test parser_test.ts`

Expected: FAIL — `parseMarkdown` not found.

- [ ] **Step 3: Write parser.ts**

```typescript
// sync/parser.ts
import { parse } from "yaml";

export interface CommonMetadata {
  "@context"?: string;
  creativeWorkStatus?: string;
  type?: string;
  name?: string;
  description?: string;
  license?: string;
  id?: string;
  creator?: Creator[];
  inLanguage?: string[];
  about?: string[];
  image?: string;
  learningResourceType?: string[];
  educationalLevel?: string[];
  datePublished?: string;
  keywords?: string[];
}

export interface Creator {
  givenName: string;
  familyName: string;
  id?: string;
  type?: string;
  affiliation?: {
    name: string;
    id?: string;
    type?: string;
  };
}

export interface ParsedMarkdown {
  metadata: CommonMetadata;
  content: string;
}

export function parseMarkdown(markdown: string): ParsedMarkdown | null {
  const match = markdown.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  if (!match) return null;

  const rawYaml = match[1];
  const content = match[2];

  // Extract only the commonMetadata block (before # staticSiteGenerator)
  const ssgIndex = rawYaml.indexOf("# staticSiteGenerator");
  const commonYaml = ssgIndex >= 0 ? rawYaml.substring(0, ssgIndex) : rawYaml;

  // Remove the # commonMetadata comment line before parsing
  const cleanedYaml = commonYaml.replace(/^# commonMetadata\s*\n/m, "");

  const parsed = parse(cleanedYaml);
  if (!parsed || typeof parsed !== "object") return null;

  return { metadata: parsed as CommonMetadata, content };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd sync && deno test parser_test.ts`

Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add sync/parser.ts sync/parser_test.ts
git commit -m "feat(sync): add YAML frontmatter parser for commonMetadata"
```

---

### Task 4: Content + image discovery

**Files:**
- Create: `sync/discover.ts`
- Create: `sync/discover_test.ts`
- Create: `sync/images.ts`
- Create: `sync/images_test.ts`
- Create: all testdata fixtures

- [ ] **Step 1: Create testdata fixtures**

Create the following files:

`sync/testdata/content/posts/de/2025-09-11-test-artikel/index.md`:
```markdown
---
# commonMetadata
'@context': https://schema.org/
creativeWorkStatus: Published
type: LearningResource
name: 'Test Artikel'
description: >-
  Ein Testartikel für den Parser.
license: https://creativecommons.org/licenses/by/4.0/deed.de
id: https://oer.community/test-artikel
creator:
  - givenName: Max
    familyName: Mustermann
    type: Person
inLanguage:
  - de
about:
  - https://w3id.org/kim/hochschulfaechersystematik/n052
image: https://oer.community/test-artikel/bild.jpg
learningResourceType:
  - https://w3id.org/kim/hcrt/text
educationalLevel:
  - https://w3id.org/kim/educationalLevel/level_A
datePublished: '2025-09-11'
keywords:
  - Open Educational Resources (OER)

# staticSiteGenerator
title: 'Test Artikel'
url: test-artikel
tags:
  - Open Educational Resources (OER)
---
# Test

Inhalt des Testartikels.
```

`sync/testdata/content/posts/de/2025-09-11-test-artikel/cover.jpg.yaml`:
```yaml
name: "Testbild Cover"
description: "Ein Testbild fuer den Artikel"
creator:
  name: "Fotografin Schmidt"
  id: "https://orcid.org/0000-0001-2345-6789"
license: "https://creativecommons.org/licenses/by-sa/4.0/"
```

`sync/testdata/content/posts/de/2025-09-11-test-artikel/ki-bild.png.yaml`:
```yaml
name: "KI-generierte Illustration"
description: "Erstellt mit Gemini ImageFX"
license: "https://creativecommons.org/publicdomain/zero/1.0/"
```

Dummy image files (empty):
```bash
touch sync/testdata/content/posts/de/2025-09-11-test-artikel/cover.jpg
touch sync/testdata/content/posts/de/2025-09-11-test-artikel/diagram.png
touch sync/testdata/content/posts/de/2025-09-11-test-artikel/ki-bild.png
```

`sync/testdata/content/posts/en/2025-09-11-test-article-en/index.md`:
```markdown
---
# commonMetadata
'@context': https://schema.org/
creativeWorkStatus: Published
type: LearningResource
name: 'Test Article EN'
description: >-
  A test article in English.
license: https://creativecommons.org/licenses/by/4.0/deed.de
id: https://oer.community/test-article-en
creator:
  - givenName: Max
    familyName: Mustermann
    type: Person
inLanguage:
  - en
image: https://oer.community/test-article-en/bild.jpg
learningResourceType:
  - https://w3id.org/kim/hcrt/text
educationalLevel:
  - https://w3id.org/kim/educationalLevel/level_A
datePublished: '2025-09-11'
keywords:
  - Open Educational Resources (OER)

# staticSiteGenerator
title: 'Test Article EN'
url: test-article-en
tags:
  - Open Educational Resources (OER)
---
# Test EN

English content.
```

`sync/testdata/content/impressum/index.md`:
```markdown
---
# commonMetadata
'@context': https://schema.org/
creativeWorkStatus: Published
name: 'Impressum'
description: >-
  Impressum der oer.community.
license: https://creativecommons.org/licenses/by/4.0/deed.de
id: https://oer.community/impressum
creator:
  - givenName: Max
    familyName: Mustermann
    type: Person
inLanguage:
  - de
datePublished: '2025-01-01'
keywords:
  - Community

# staticSiteGenerator
title: 'Impressum'
url: impressum
---
## Impressum

Angaben gemäß § 5 TMG.
```

`sync/testdata/content/missing-fields/index.md`:
```markdown
---
# commonMetadata
name: 'Unvollständig'

# staticSiteGenerator
title: 'Unvollständig'
---
Inhalt ohne gültiges YAML.
```

- [ ] **Step 2: Write discover tests**

```typescript
// sync/discover_test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { discoverContent } from "./discover.ts";

Deno.test("discoverContent finds posts and pages in testdata", async () => {
  const files = await discoverContent("./testdata/content");

  const posts = files.filter((f) => f.type === "post");
  const pages = files.filter((f) => f.type === "page");

  assertEquals(posts.length, 2);
  assertEquals(pages.length >= 2, true);

  const dePost = posts.find((f) => f.lang === "de");
  const enPost = posts.find((f) => f.lang === "en");
  assertEquals(dePost !== undefined, true);
  assertEquals(enPost !== undefined, true);
});

Deno.test("discoverContent skips posts directory as page", async () => {
  const files = await discoverContent("./testdata/content");
  const postsPage = files.find((f) => f.type === "page" && f.path.includes("/posts/"));
  assertEquals(postsPage, undefined);
});
```

- [ ] **Step 3: Write discover.ts**

```typescript
// sync/discover.ts

export interface ContentFile {
  path: string;
  type: "post" | "page";
  lang?: string;
}

export async function discoverContent(contentDir: string): Promise<ContentFile[]> {
  const files: ContentFile[] = [];

  // Discover posts: content/posts/{lang}/{slug}/index.md
  const postsDir = `${contentDir}/posts`;
  try {
    for await (const langEntry of Deno.readDir(postsDir)) {
      if (!langEntry.isDirectory) continue;
      const lang = langEntry.name;
      const langDir = `${postsDir}/${lang}`;
      for await (const postEntry of Deno.readDir(langDir)) {
        if (!postEntry.isDirectory) continue;
        const indexPath = `${langDir}/${postEntry.name}/index.md`;
        try {
          await Deno.stat(indexPath);
          files.push({ path: indexPath, type: "post", lang });
        } catch { /* no index.md, skip */ }
      }
    }
  } catch { /* no posts dir, skip */ }

  // Discover pages: content/{name}/index.md (skip "posts" directory)
  try {
    for await (const entry of Deno.readDir(contentDir)) {
      if (!entry.isDirectory || entry.name === "posts") continue;
      const indexPath = `${contentDir}/${entry.name}/index.md`;
      try {
        await Deno.stat(indexPath);
        files.push({ path: indexPath, type: "page" });
      } catch { /* no index.md, skip */ }
    }
  } catch { /* content dir issue */ }

  return files;
}
```

- [ ] **Step 4: Write image sidecar tests**

```typescript
// sync/images_test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { discoverImages, parseImageYaml, type ImageMeta } from "./images.ts";

Deno.test("discoverImages finds images with and without YAML sidecars", async () => {
  const images = await discoverImages("./testdata/content/posts/de/2025-09-11-test-artikel");
  assertEquals(images.length, 3);

  const cover = images.find((i) => i.filename === "cover.jpg");
  assertEquals(cover!.hasYaml, true);

  const diagram = images.find((i) => i.filename === "diagram.png");
  assertEquals(diagram!.hasYaml, false);

  const kiBild = images.find((i) => i.filename === "ki-bild.png");
  assertEquals(kiBild!.hasYaml, true);
});

Deno.test("discoverImages ignores non-image files", async () => {
  const images = await discoverImages("./testdata/content/posts/de/2025-09-11-test-artikel");
  const filenames = images.map((i) => i.filename);
  assertEquals(filenames.includes("index.md"), false);
  assertEquals(filenames.includes("cover.jpg.yaml"), false);
});

Deno.test("parseImageYaml reads sidecar YAML", () => {
  const meta = parseImageYaml("./testdata/content/posts/de/2025-09-11-test-artikel/cover.jpg.yaml");
  assertEquals(meta!.name, "Testbild Cover");
  assertEquals(meta!.license, "https://creativecommons.org/licenses/by-sa/4.0/");
  assertEquals(meta!.creator?.name, "Fotografin Schmidt");
});

Deno.test("parseImageYaml reads CC0 image without creator", () => {
  const meta = parseImageYaml("./testdata/content/posts/de/2025-09-11-test-artikel/ki-bild.png.yaml");
  assertEquals(meta!.license, "https://creativecommons.org/publicdomain/zero/1.0/");
  assertEquals(meta!.creator, undefined);
});
```

- [ ] **Step 5: Write images.ts**

```typescript
// sync/images.ts
import { parse } from "yaml";

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".avif"]);

export interface ImageFile {
  filename: string;
  dirPath: string;
  hasYaml: boolean;
  yamlPath?: string;
}

export interface ImageMeta {
  name: string;
  description?: string;
  license: string;
  creator?: {
    name: string;
    id?: string;
  };
  inLanguage?: string;
  dateCreated?: string;
  datePublished?: string;
}

export async function discoverImages(dirPath: string): Promise<ImageFile[]> {
  const images: ImageFile[] = [];

  try {
    for await (const entry of Deno.readDir(dirPath)) {
      if (!entry.isFile) continue;
      const ext = entry.name.substring(entry.name.lastIndexOf(".")).toLowerCase();
      if (!IMAGE_EXTENSIONS.has(ext)) continue;

      const yamlPath = `${dirPath}/${entry.name}.yaml`;
      let hasYaml = false;
      try {
        await Deno.stat(yamlPath);
        hasYaml = true;
      } catch { /* no yaml sidecar */ }

      images.push({
        filename: entry.name,
        dirPath,
        hasYaml,
        yamlPath: hasYaml ? yamlPath : undefined,
      });
    }
  } catch { /* dir not readable */ }

  return images;
}

export function parseImageYaml(yamlPath: string): ImageMeta | null {
  try {
    const content = Deno.readTextFileSync(yamlPath);
    const parsed = parse(content);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as ImageMeta;
  } catch {
    return null;
  }
}
```

- [ ] **Step 6: Run all discovery tests**

Run: `cd sync && deno test discover_test.ts images_test.ts --allow-read`

Expected: 6 tests pass.

- [ ] **Step 7: Commit**

```bash
git add sync/discover.ts sync/discover_test.ts sync/images.ts sync/images_test.ts sync/testdata/
git commit -m "feat(sync): add content discovery and image sidecar parsing"
```

---

### Task 5: Kind 30023 event builder

**Files:**
- Create: `sync/events/article.ts`
- Create: `sync/events/article_test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// sync/events/article_test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildArticleEvent } from "./article.ts";
import type { CommonMetadata } from "../parser.ts";

const PUBKEY = "5a12b41ec15b466321e88c371be2dc47d9193f9c8bba4ab09fc50045bd35aedf";
const AMB_RELAY = "wss://amb-relay.edufeed.org/";

const METADATA: CommonMetadata = {
  id: "https://oer.community/test-artikel",
  name: "Test Artikel",
  description: "Ein Testartikel.",
  license: "https://creativecommons.org/licenses/by/4.0/deed.de",
  image: "https://oer.community/test-artikel/bild.jpg",
  creator: [{ givenName: "Max", familyName: "Mustermann", type: "Person" }],
  inLanguage: ["de"],
  about: ["https://w3id.org/kim/hochschulfaechersystematik/n052"],
  datePublished: "2025-09-11",
  keywords: ["Open Educational Resources (OER)", "Community"],
  type: "LearningResource",
  learningResourceType: ["https://w3id.org/kim/hcrt/text"],
  educationalLevel: ["https://w3id.org/kim/educationalLevel/level_A"],
};

const CONTENT = "# Überschrift\n\nHier ist der Inhalt.";

Deno.test("buildArticleEvent creates kind 30023 with correct tags", () => {
  const event = buildArticleEvent(METADATA, CONTENT, PUBKEY, AMB_RELAY);

  assertEquals(event.kind, 30023);
  assertEquals(event.pubkey, PUBKEY);
  assertEquals(event.content, CONTENT);

  const getTag = (name: string) => event.tags.find((t: string[]) => t[0] === name);
  const getTags = (name: string) => event.tags.filter((t: string[]) => t[0] === name);

  assertEquals(getTag("d")?.[1], "test-artikel");
  assertEquals(getTag("title")?.[1], "Test Artikel");
  assertEquals(getTag("summary")?.[1], "Ein Testartikel.");
  assertEquals(getTag("summary")?.[2], "de");
  assertEquals(getTag("image")?.[1], "https://oer.community/test-artikel/bild.jpg");
  assertEquals(getTag("published_at")?.[1], String(new Date("2025-09-11").getTime() / 1000));
  assertEquals(getTag("inLanguage")?.[1], "de");

  assertEquals(getTags("about").length, 1);
  assertEquals(getTags("about")[0][1], "https://w3id.org/kim/hochschulfaechersystematik/n052");

  assertEquals(getTags("t").length, 2);
  assertEquals(getTags("t")[0][1], "Open Educational Resources (OER)");
  assertEquals(getTags("t")[1][1], "Community");
});

Deno.test("buildArticleEvent includes AMB reference for LearningResource", () => {
  const event = buildArticleEvent(METADATA, CONTENT, PUBKEY, AMB_RELAY);
  const aTag = event.tags.find((t: string[]) => t[0] === "a" && t[3] === "amb-metadata");
  assertEquals(aTag?.[1], `30142:${PUBKEY}:test-artikel`);
  assertEquals(aTag?.[2], AMB_RELAY);
});

Deno.test("buildArticleEvent omits AMB reference for non-LearningResource", () => {
  const pageMetadata = { ...METADATA, type: "WebPage" };
  const event = buildArticleEvent(pageMetadata, CONTENT, PUBKEY, AMB_RELAY);
  const aTag = event.tags.find((t: string[]) => t[0] === "a" && t[3] === "amb-metadata");
  assertEquals(aTag, undefined);
});

Deno.test("buildArticleEvent extracts slug from id URL", () => {
  const event = buildArticleEvent(METADATA, CONTENT, PUBKEY, AMB_RELAY);
  const dTag = event.tags.find((t: string[]) => t[0] === "d");
  assertEquals(dTag?.[1], "test-artikel");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd sync && deno test events/article_test.ts`

Expected: FAIL — `buildArticleEvent` not found.

- [ ] **Step 3: Write article.ts**

```typescript
// sync/events/article.ts
import type { CommonMetadata } from "../parser.ts";

export interface UnsignedEvent {
  kind: number;
  pubkey: string;
  created_at: number;
  tags: string[][];
  content: string;
}

export function extractSlug(id: string): string {
  const url = new URL(id);
  return url.pathname.replace(/^\//, "").replace(/\/$/, "");
}

export function buildArticleEvent(
  metadata: CommonMetadata,
  content: string,
  pubkey: string,
  ambRelay: string,
): UnsignedEvent {
  const slug = extractSlug(metadata.id!);
  const lang = metadata.inLanguage?.[0] ?? "de";

  const tags: string[][] = [
    ["d", slug],
    ["title", metadata.name!],
    ["summary", metadata.description!, lang],
    ["published_at", String(new Date(metadata.datePublished!).getTime() / 1000)],
    ["inLanguage", lang],
  ];

  if (metadata.image) {
    tags.push(["image", metadata.image]);
  }

  if (metadata.about) {
    for (const uri of metadata.about) {
      tags.push(["about", uri]);
    }
  }

  if (metadata.keywords) {
    for (const kw of metadata.keywords) {
      tags.push(["t", kw]);
    }
  }

  // AMB reference only for LearningResource
  if (metadata.type === "LearningResource") {
    tags.push(["a", `30142:${pubkey}:${slug}`, ambRelay, "amb-metadata"]);
  }

  return {
    kind: 30023,
    pubkey,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd sync && deno test events/article_test.ts`

Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add sync/events/article.ts sync/events/article_test.ts
git commit -m "feat(sync): add Kind 30023 article event builder"
```

---

### Task 6: Kind 30142 AMB event builder (articles)

**Files:**
- Create: `sync/events/amb.ts`
- Create: `sync/events/amb_test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// sync/events/amb_test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildAmbEvent } from "./amb.ts";
import type { CommonMetadata } from "../parser.ts";

const PUBKEY = "5a12b41ec15b466321e88c371be2dc47d9193f9c8bba4ab09fc50045bd35aedf";
const CONTENT_RELAY = "wss://relay-rpi.edufeed.org/";

const METADATA: CommonMetadata = {
  id: "https://oer.community/test-artikel",
  type: "LearningResource",
  name: "Test Artikel",
  description: "Ein Testartikel.",
  license: "https://creativecommons.org/licenses/by/4.0/deed.de",
  image: "https://oer.community/test-artikel/bild.jpg",
  creator: [
    {
      givenName: "Max",
      familyName: "Mustermann",
      id: "https://orcid.org/0000-0000-0000-0001",
      type: "Person",
      affiliation: {
        name: "Test-Uni",
        id: "https://ror.org/example123",
        type: "Organization",
      },
    },
  ],
  inLanguage: ["de"],
  about: ["https://w3id.org/kim/hochschulfaechersystematik/n052"],
  learningResourceType: [
    "https://w3id.org/kim/hcrt/text",
    "https://w3id.org/kim/hcrt/web_page",
  ],
  educationalLevel: ["https://w3id.org/kim/educationalLevel/level_A"],
  datePublished: "2025-09-11",
  keywords: ["Open Educational Resources (OER)", "Community"],
};

Deno.test("buildAmbEvent creates kind 30142 with correct d-tag", () => {
  const event = buildAmbEvent(METADATA, PUBKEY, CONTENT_RELAY);
  assertEquals(event.kind, 30142);
  assertEquals(event.pubkey, PUBKEY);
  const dTag = event.tags.find((t: string[]) => t[0] === "d");
  assertEquals(dTag?.[1], "test-artikel");
});

Deno.test("buildAmbEvent sets content to description", () => {
  const event = buildAmbEvent(METADATA, PUBKEY, CONTENT_RELAY);
  assertEquals(event.content, "Ein Testartikel.");
});

Deno.test("buildAmbEvent includes type and name tags", () => {
  const event = buildAmbEvent(METADATA, PUBKEY, CONTENT_RELAY);
  const getTag = (name: string) => event.tags.find((t: string[]) => t[0] === name);
  assertEquals(getTag("type")?.[1], "LearningResource");
  assertEquals(getTag("name")?.[1], "Test Artikel");
  assertEquals(getTag("description")?.[1], "Ein Testartikel.");
});

Deno.test("buildAmbEvent flattens creator with affiliation", () => {
  const event = buildAmbEvent(METADATA, PUBKEY, CONTENT_RELAY);
  const getTags = (name: string) => event.tags.filter((t: string[]) => t[0] === name);
  assertEquals(getTags("creator:name")[0]?.[1], "Max Mustermann");
  assertEquals(getTags("creator:type")[0]?.[1], "Person");
  assertEquals(getTags("creator:id")[0]?.[1], "https://orcid.org/0000-0000-0000-0001");
  assertEquals(getTags("creator:affiliation:name")[0]?.[1], "Test-Uni");
  assertEquals(getTags("creator:affiliation:id")[0]?.[1], "https://ror.org/example123");
});

Deno.test("buildAmbEvent flattens educational metadata", () => {
  const event = buildAmbEvent(METADATA, PUBKEY, CONTENT_RELAY);
  const getTags = (name: string) => event.tags.filter((t: string[]) => t[0] === name);
  assertEquals(getTags("learningResourceType:id").length, 2);
  assertEquals(getTags("educationalLevel:id").length, 1);
  assertEquals(getTags("about:id").length, 1);
});

Deno.test("buildAmbEvent includes license, dates, language, image", () => {
  const event = buildAmbEvent(METADATA, PUBKEY, CONTENT_RELAY);
  const getTag = (name: string) => event.tags.find((t: string[]) => t[0] === name);
  assertEquals(getTag("license:id")?.[1], "https://creativecommons.org/licenses/by/4.0/deed.de");
  assertEquals(getTag("datePublished")?.[1], "2025-09-11");
  assertEquals(getTag("inLanguage")?.[1], "de");
  assertEquals(getTag("image")?.[1], "https://oer.community/test-artikel/bild.jpg");
});

Deno.test("buildAmbEvent includes t-tags from keywords", () => {
  const event = buildAmbEvent(METADATA, PUBKEY, CONTENT_RELAY);
  const tTags = event.tags.filter((t: string[]) => t[0] === "t");
  assertEquals(tTags.length, 2);
});

Deno.test("buildAmbEvent includes content reference a-tag", () => {
  const event = buildAmbEvent(METADATA, PUBKEY, CONTENT_RELAY);
  const aTag = event.tags.find((t: string[]) => t[0] === "a" && t[3] === "content");
  assertEquals(aTag?.[1], `30023:${PUBKEY}:test-artikel`);
  assertEquals(aTag?.[2], CONTENT_RELAY);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd sync && deno test events/amb_test.ts`

Expected: FAIL — `buildAmbEvent` not found.

- [ ] **Step 3: Write amb.ts**

```typescript
// sync/events/amb.ts
import type { CommonMetadata } from "../parser.ts";
import { extractSlug, type UnsignedEvent } from "./article.ts";

export function buildAmbEvent(
  metadata: CommonMetadata,
  pubkey: string,
  contentRelay: string,
): UnsignedEvent {
  const slug = extractSlug(metadata.id!);

  const tags: string[][] = [
    ["d", slug],
    ["type", metadata.type ?? "LearningResource"],
    ["name", metadata.name!],
    ["description", metadata.description!],
  ];

  if (metadata.license) {
    tags.push(["license:id", metadata.license]);
  }

  if (metadata.creator) {
    for (const creator of metadata.creator) {
      tags.push(["creator:name", `${creator.givenName} ${creator.familyName}`]);
      if (creator.type) tags.push(["creator:type", creator.type]);
      if (creator.id) tags.push(["creator:id", creator.id]);
      if (creator.affiliation) {
        tags.push(["creator:affiliation:name", creator.affiliation.name]);
        if (creator.affiliation.id) tags.push(["creator:affiliation:id", creator.affiliation.id]);
      }
    }
  }

  if (metadata.inLanguage) {
    for (const lang of metadata.inLanguage) tags.push(["inLanguage", lang]);
  }

  if (metadata.about) {
    for (const uri of metadata.about) tags.push(["about:id", uri]);
  }

  if (metadata.learningResourceType) {
    for (const uri of metadata.learningResourceType) tags.push(["learningResourceType:id", uri]);
  }

  if (metadata.educationalLevel) {
    for (const uri of metadata.educationalLevel) tags.push(["educationalLevel:id", uri]);
  }

  if (metadata.datePublished) tags.push(["datePublished", metadata.datePublished]);
  if (metadata.image) tags.push(["image", metadata.image]);

  if (metadata.keywords) {
    for (const kw of metadata.keywords) tags.push(["t", kw]);
  }

  tags.push(["a", `30023:${pubkey}:${slug}`, contentRelay, "content"]);

  return {
    kind: 30142,
    pubkey,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: metadata.description ?? "",
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd sync && deno test events/amb_test.ts`

Expected: 8 tests pass.

- [ ] **Step 5: Commit**

```bash
git add sync/events/amb.ts sync/events/amb_test.ts
git commit -m "feat(sync): add Kind 30142 AMB event builder with NIP-AMB flattening"
```

---

### Task 7: Kind 30142 image AMB event builder

**Files:**
- Create: `sync/events/image_amb.ts`
- Create: `sync/events/image_amb_test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// sync/events/image_amb_test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildImageAmbEvent } from "./image_amb.ts";
import type { ImageMeta } from "../images.ts";

const PUBKEY = "5a12b41ec15b466321e88c371be2dc47d9193f9c8bba4ab09fc50045bd35aedf";

const IMAGE_META: ImageMeta = {
  name: "Testbild Cover",
  description: "Ein Testbild",
  license: "https://creativecommons.org/licenses/by-sa/4.0/",
  creator: { name: "Fotografin Schmidt", id: "https://orcid.org/0000-0001-2345-6789" },
  dateCreated: "2025-06-15",
  datePublished: "2025-06-20",
  inLanguage: "de",
};

const SLUG = "test-artikel";
const FILENAME = "cover.jpg";

Deno.test("buildImageAmbEvent creates kind 30142 with URL-based d-tag", () => {
  const event = buildImageAmbEvent(IMAGE_META, SLUG, FILENAME, PUBKEY);
  assertEquals(event.kind, 30142);
  const dTag = event.tags.find((t: string[]) => t[0] === "d");
  assertEquals(dTag?.[1], "https://oer.community/test-artikel/cover.jpg");
});

Deno.test("buildImageAmbEvent sets dual type tags", () => {
  const event = buildImageAmbEvent(IMAGE_META, SLUG, FILENAME, PUBKEY);
  const typeTags = event.tags.filter((t: string[]) => t[0] === "type");
  assertEquals(typeTags.length, 2);
  assertEquals(typeTags[0][1], "LearningResource");
  assertEquals(typeTags[1][1], "Image");
});

Deno.test("buildImageAmbEvent includes fixed learningResourceType tags", () => {
  const event = buildImageAmbEvent(IMAGE_META, SLUG, FILENAME, PUBKEY);
  const lrtId = event.tags.find((t: string[]) => t[0] === "learningResourceType:id");
  const lrtDe = event.tags.find((t: string[]) => t[0] === "learningResourceType:prefLabel:de");
  const lrtEn = event.tags.find((t: string[]) => t[0] === "learningResourceType:prefLabel:en");
  assertEquals(lrtId?.[1], "https://w3id.org/kim/hcrt/image");
  assertEquals(lrtDe?.[1], "Abbildung");
  assertEquals(lrtEn?.[1], "Image");
});

Deno.test("buildImageAmbEvent includes creator with id", () => {
  const event = buildImageAmbEvent(IMAGE_META, SLUG, FILENAME, PUBKEY);
  assertEquals(event.tags.find((t: string[]) => t[0] === "creator:name")?.[1], "Fotografin Schmidt");
  assertEquals(event.tags.find((t: string[]) => t[0] === "creator:id")?.[1], "https://orcid.org/0000-0001-2345-6789");
});

Deno.test("buildImageAmbEvent includes license, dates, image URL", () => {
  const event = buildImageAmbEvent(IMAGE_META, SLUG, FILENAME, PUBKEY);
  const getTag = (name: string) => event.tags.find((t: string[]) => t[0] === name);
  assertEquals(getTag("license:id")?.[1], "https://creativecommons.org/licenses/by-sa/4.0/");
  assertEquals(getTag("dateCreated")?.[1], "2025-06-15");
  assertEquals(getTag("datePublished")?.[1], "2025-06-20");
  assertEquals(getTag("image")?.[1], "https://oer.community/test-artikel/cover.jpg");
  assertEquals(getTag("isAccessibleForFree")?.[1], "true");
});

Deno.test("buildImageAmbEvent omits creator for CC0 image", () => {
  const cc0Meta: ImageMeta = { name: "KI-Bild", license: "https://creativecommons.org/publicdomain/zero/1.0/" };
  const event = buildImageAmbEvent(cc0Meta, SLUG, FILENAME, PUBKEY);
  assertEquals(event.tags.find((t: string[]) => t[0] === "creator:name"), undefined);
});

Deno.test("buildImageAmbEvent includes inLanguage if set", () => {
  const event = buildImageAmbEvent(IMAGE_META, SLUG, FILENAME, PUBKEY);
  assertEquals(event.tags.find((t: string[]) => t[0] === "inLanguage")?.[1], "de");
});

Deno.test("buildImageAmbEvent sets empty content", () => {
  const event = buildImageAmbEvent(IMAGE_META, SLUG, FILENAME, PUBKEY);
  assertEquals(event.content, "");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd sync && deno test events/image_amb_test.ts`

Expected: FAIL — `buildImageAmbEvent` not found.

- [ ] **Step 3: Write image_amb.ts**

```typescript
// sync/events/image_amb.ts
import type { ImageMeta } from "../images.ts";
import type { UnsignedEvent } from "./article.ts";

export function buildImageAmbEvent(
  meta: ImageMeta,
  articleSlug: string,
  filename: string,
  pubkey: string,
): UnsignedEvent {
  const imageUrl = `https://oer.community/${articleSlug}/${filename}`;

  const tags: string[][] = [
    ["d", imageUrl],
    ["type", "LearningResource"],
    ["type", "Image"],
    ["name", meta.name],
  ];

  if (meta.description) tags.push(["description", meta.description]);
  tags.push(["license:id", meta.license]);

  if (meta.creator) {
    tags.push(["creator:name", meta.creator.name]);
    if (meta.creator.id) tags.push(["creator:id", meta.creator.id]);
  }

  if (meta.inLanguage) tags.push(["inLanguage", meta.inLanguage]);
  if (meta.dateCreated) tags.push(["dateCreated", meta.dateCreated]);
  if (meta.datePublished) tags.push(["datePublished", meta.datePublished]);

  tags.push(["learningResourceType:id", "https://w3id.org/kim/hcrt/image"]);
  tags.push(["learningResourceType:prefLabel:de", "Abbildung"]);
  tags.push(["learningResourceType:prefLabel:en", "Image"]);
  tags.push(["isAccessibleForFree", "true"]);
  tags.push(["image", imageUrl]);

  return {
    kind: 30142,
    pubkey,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: "",
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd sync && deno test events/image_amb_test.ts`

Expected: 8 tests pass.

- [ ] **Step 5: Commit**

```bash
git add sync/events/image_amb.ts sync/events/image_amb_test.ts
git commit -m "feat(sync): add Kind 30142 image AMB event builder"
```

---

### Task 8: Sync orchestrator with dry-run output

**Files:**
- Create: `sync/sync.ts`
- Create: `sync/sync_test.ts`

- [ ] **Step 1: Write the failing integration test**

```typescript
// sync/sync_test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { discoverContent } from "./discover.ts";
import { processContent, type SyncResult } from "./sync.ts";

Deno.test("processContent returns events for valid LearningResource", async () => {
  const files = await discoverContent("./testdata/content");
  const validPost = files.find((f) => f.path.includes("test-artikel") && f.lang === "de")!;

  const result = await processContent(validPost, "testpubkey", "wss://content/", "wss://amb/");

  assertEquals(result.status, "ok");
  assertEquals(result.articleEvent!.kind, 30023);
  assertEquals(result.ambEvent!.kind, 30142);
});

Deno.test("processContent returns only article event for non-LearningResource", async () => {
  const files = await discoverContent("./testdata/content");
  const impressum = files.find((f) => f.path.includes("impressum"))!;

  const result = await processContent(impressum, "testpubkey", "wss://content/", "wss://amb/");

  assertEquals(result.status, "ok");
  assertEquals(result.articleEvent !== null, true);
  assertEquals(result.ambEvent, null);
});

Deno.test("processContent returns error for missing fields", async () => {
  const files = await discoverContent("./testdata/content");
  const invalid = files.find((f) => f.path.includes("missing-fields"))!;

  const result = await processContent(invalid, "testpubkey", "wss://content/", "wss://amb/");

  assertEquals(result.status, "error");
  assertEquals(result.errors.length > 0, true);
});

Deno.test("processContent discovers image AMB events", async () => {
  const files = await discoverContent("./testdata/content");
  const validPost = files.find((f) => f.path.includes("test-artikel") && f.lang === "de")!;

  const result = await processContent(validPost, "testpubkey", "wss://content/", "wss://amb/");

  // cover.jpg + ki-bild.png have YAML → 2 image AMB events
  assertEquals(result.imageAmbEvents.length, 2);
  assertEquals(result.imageAmbEvents[0].kind, 30142);
  // diagram.png has no YAML → warning
  assertEquals(result.imageWarnings.length, 1);
  assertEquals(result.imageWarnings[0].includes("diagram.png"), true);
});

Deno.test("processContent returns no image events for page without images", async () => {
  const files = await discoverContent("./testdata/content");
  const impressum = files.find((f) => f.path.includes("impressum"))!;

  const result = await processContent(impressum, "testpubkey", "wss://content/", "wss://amb/");

  assertEquals(result.imageAmbEvents.length, 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd sync && deno test sync_test.ts --allow-read`

Expected: FAIL — `processContent` not found.

- [ ] **Step 3: Write sync.ts**

```typescript
// sync/sync.ts
import { loadConfig } from "./config.ts";
import { discoverContent, type ContentFile } from "./discover.ts";
import { parseMarkdown } from "./parser.ts";
import { buildArticleEvent, extractSlug, type UnsignedEvent } from "./events/article.ts";
import { buildAmbEvent } from "./events/amb.ts";
import { buildImageAmbEvent } from "./events/image_amb.ts";
import { discoverImages, parseImageYaml } from "./images.ts";

export interface SyncResult {
  slug: string;
  status: "ok" | "error";
  articleEvent: UnsignedEvent | null;
  ambEvent: UnsignedEvent | null;
  imageAmbEvents: UnsignedEvent[];
  imageWarnings: string[];
  errors: string[];
  warnings: string[];
}

function validateRequired(metadata: Record<string, unknown>): string[] {
  const errors: string[] = [];
  const required = ["id", "name", "description", "license", "creator", "inLanguage", "datePublished", "keywords"];
  for (const field of required) {
    const val = metadata[field];
    if (val === undefined || val === null || val === "") {
      errors.push(`Pflichtfeld fehlt: ${field}`);
    } else if (Array.isArray(val) && val.length === 0) {
      errors.push(`Pflichtfeld leer: ${field}`);
    }
  }
  const id = metadata.id as string | undefined;
  if (id && !id.startsWith("https://oer.community/")) {
    errors.push("id muss mit https://oer.community/ beginnen");
  }
  return errors;
}

export async function processContent(
  file: ContentFile,
  pubkey: string,
  contentRelay: string,
  ambRelay: string,
): Promise<SyncResult> {
  const empty: SyncResult = {
    slug: file.path, status: "error",
    articleEvent: null, ambEvent: null,
    imageAmbEvents: [], imageWarnings: [],
    errors: [], warnings: [],
  };

  let markdown: string;
  try {
    markdown = Deno.readTextFileSync(file.path);
  } catch (e) {
    return { ...empty, errors: [`Datei nicht lesbar: ${e}`] };
  }

  const parsed = parseMarkdown(markdown);
  if (!parsed) {
    return { ...empty, errors: ["Kein YAML-Frontmatter gefunden"] };
  }

  const errors = validateRequired(parsed.metadata as unknown as Record<string, unknown>);
  if (errors.length > 0) {
    return { ...empty, slug: parsed.metadata.id ?? file.path, errors };
  }

  const articleEvent = buildArticleEvent(parsed.metadata, parsed.content, pubkey, ambRelay);
  const slug = articleEvent.tags.find((t) => t[0] === "d")?.[1] ?? file.path;

  let ambEvent: UnsignedEvent | null = null;
  if (parsed.metadata.type === "LearningResource") {
    ambEvent = buildAmbEvent(parsed.metadata, pubkey, contentRelay);
  }

  // Discover and process images
  const dirPath = file.path.substring(0, file.path.lastIndexOf("/"));
  const imageFiles = await discoverImages(dirPath);
  const imageAmbEvents: UnsignedEvent[] = [];
  const imageWarnings: string[] = [];

  for (const img of imageFiles) {
    if (!img.hasYaml) {
      imageWarnings.push(`${img.filename} — KEINE .yaml Datei`);
      continue;
    }
    const meta = parseImageYaml(img.yamlPath!);
    if (!meta) {
      imageWarnings.push(`${img.filename} — .yaml nicht lesbar`);
      continue;
    }
    if (!meta.name || !meta.license) {
      imageWarnings.push(`${img.filename} — Pflichtfeld fehlt (name oder license)`);
      continue;
    }
    imageAmbEvents.push(buildImageAmbEvent(meta, slug, img.filename, pubkey));
  }

  return {
    slug, status: "ok",
    articleEvent, ambEvent,
    imageAmbEvents, imageWarnings,
    errors: [], warnings: [],
  };
}

function formatResult(result: SyncResult): string {
  if (result.status === "error") {
    return `❌ ${result.slug} — ${result.errors.join(", ")}`;
  }
  const parts = ["30023"];
  if (result.ambEvent) parts.push("30142");
  if (result.imageAmbEvents.length > 0) parts.push(`${result.imageAmbEvents.length} Bild-AMB`);
  const prefix = result.ambEvent ? "✅" : "ℹ️ ";
  const suffix = !result.ambEvent ? " (kein AMB — type ist nicht LearningResource)" : "";
  return `${prefix} ${result.slug} (${parts.join(" + ")})${suffix}`;
}

// Main entry point
if (import.meta.main) {
  const config = loadConfig();
  console.log(`nostr-sync${config.dryRun ? " (DRY RUN)" : ""}`);
  console.log(`Content-Verzeichnis: ${config.contentDir}\n`);

  const files = await discoverContent(config.contentDir);
  console.log(`${files.length} Dateien gefunden\n`);

  let okCount = 0;
  let ambCount = 0;
  let imageAmbCount = 0;
  let errorCount = 0;

  for (const file of files) {
    const result = await processContent(file, config.pubkey, config.contentRelay, config.ambRelay);
    console.log(formatResult(result));

    for (const w of result.imageWarnings) console.log(`   ⚠️  ${w}`);

    if (config.dryRun && result.articleEvent) {
      console.log(`   30023 tags: ${JSON.stringify(result.articleEvent.tags)}`);
      if (result.ambEvent) console.log(`   30142 tags: ${JSON.stringify(result.ambEvent.tags)}`);
      for (const imgEvt of result.imageAmbEvents) {
        const imgD = imgEvt.tags.find((t) => t[0] === "d")?.[1] ?? "?";
        console.log(`   30142 (Bild) d: ${imgD}`);
      }
    }

    if (result.status === "ok") {
      okCount++;
      if (result.ambEvent) ambCount++;
      imageAmbCount += result.imageAmbEvents.length;
    } else {
      errorCount++;
    }
  }

  console.log(`\n--- Zusammenfassung ---`);
  console.log(`✅ ${okCount} Artikel-Events (davon ${ambCount} mit AMB)`);
  console.log(`🖼️  ${imageAmbCount} Bild-AMB-Events`);
  if (errorCount > 0) console.log(`❌ ${errorCount} Fehler`);

  if (!config.dryRun) {
    console.log("\n⚠️  Live-Modus: Relay-Publish noch nicht implementiert.");
  }
}
```

- [ ] **Step 4: Run integration tests**

Run: `cd sync && deno test sync_test.ts --allow-read`

Expected: 5 tests pass.

- [ ] **Step 5: Run all tests together**

Run: `cd sync && deno test --allow-read`

Expected: All tests pass (4 + 6 + 4 + 8 + 8 + 5 = 35 tests).

- [ ] **Step 6: Commit**

```bash
git add sync/sync.ts sync/sync_test.ts
git commit -m "feat(sync): add sync orchestrator with image AMB support and dry-run"
```

---

### Task 9: End-to-end dry-run test

**Files:**
- No new files — manual verification with testdata

- [ ] **Step 1: Run dry-run against testdata**

Run: `cd sync && CONTENT_DIR=./testdata/content DRY_RUN=true deno task sync`

Expected output (approximate):
```
nostr-sync (DRY RUN)
Content-Verzeichnis: ./testdata/content

4 Dateien gefunden

✅ test-artikel (30023 + 30142 + 2 Bild-AMB)
   ⚠️  diagram.png — KEINE .yaml Datei
   30023 tags: [["d","test-artikel"],["title","Test Artikel"],...]
   30142 tags: [["d","test-artikel"],["type","LearningResource"],...]
   30142 (Bild) d: https://oer.community/test-artikel/cover.jpg
   30142 (Bild) d: https://oer.community/test-artikel/ki-bild.png
✅ test-article-en (30023 + 30142)
   30023 tags: [...]
   30142 tags: [...]
ℹ️  impressum (30023) (kein AMB — type ist nicht LearningResource)
   30023 tags: [...]
❌ missing-fields — Pflichtfeld fehlt: id, ...

--- Zusammenfassung ---
✅ 3 Artikel-Events (davon 2 mit AMB)
🖼️  2 Bild-AMB-Events
❌ 1 Fehler
```

- [ ] **Step 2: Verify d-tags match expected patterns**

Check that:
- Article d-tags: `test-artikel`, `test-article-en`, `impressum`
- Image d-tags: `https://oer.community/test-artikel/cover.jpg`, `https://oer.community/test-artikel/ki-bild.png`
- No image d-tag for `diagram.png` (missing YAML)

- [ ] **Step 3: Verify AMB gating**

Check that:
- `type: LearningResource` → 30023 + 30142 + image AMBs
- No type (impressum) → only 30023
- missing-fields → error

- [ ] **Step 4: Commit final state**

```bash
git add -A sync/
git commit -m "feat(sync): complete dry-run implementation with article + image AMB support"
```

---

## Summary

| Task | What it builds | Tests |
|---|---|---|
| 1 | Deno project setup | — |
| 2 | Config module | — |
| 3 | YAML parser (commonMetadata) | 4 |
| 4 | Content + image discovery | 6 |
| 5 | Kind 30023 event builder | 4 |
| 6 | Kind 30142 AMB event builder (articles) | 8 |
| 7 | Kind 30142 image AMB event builder | 8 |
| 8 | Sync orchestrator + dry-run | 5 |
| 9 | E2E verification | manual |
| **Total** | | **35 tests** |

## Workflow

```
# Prerequisite: content-lint has validated the content repo
deno task dry-run      # Events bauen und anzeigen (kein Netzwerk)
deno task sync         # Events bauen und publizieren (live, noch nicht impl.)
```
