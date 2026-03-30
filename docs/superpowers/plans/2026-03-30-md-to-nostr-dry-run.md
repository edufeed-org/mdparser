# md-to-nostr Dry-Run Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Deno-based toolchain that (1) validates and fixes YAML frontmatter, (2) generates missing image YAML templates, and (3) builds Kind 30023 + Kind 30142 Nostr events in dry-run mode. Three commands: `validate`, `image-yaml`, `sync`.

**Architecture:** Modular Deno TypeScript — shared parser and validator modules used by all three commands. The `validate` command checks and reports on existing YAMLs. The `image-yaml` command generates `.yaml` sidecar templates for images missing them. The `sync` command builds Nostr events from validated content. No network access needed for dry-run. Follows wp-to-nostr patterns (env vars, `deno task` commands).

**Tech Stack:** Deno, TypeScript, `npm:yaml` for YAML parsing/stringifying, `npm:nostr-tools` for event structure validation.

---

## File Structure

```
sync/
├── deno.json              # Deno config, tasks, imports
├── config.ts              # Configuration from env vars + defaults
├── discover.ts            # Content discovery (shared by all commands)
├── discover_test.ts       # Tests for content discovery
├── parser.ts              # YAML frontmatter extraction (commonMetadata only)
├── parser_test.ts         # Tests for parser
├── validator.ts           # Pflichtfeld-Validierung + Konsistenzprüfung
├── validator_test.ts      # Tests for validator
├── images.ts              # Image YAML sidecar discovery + parsing
├── images_test.ts         # Tests for image discovery
├── commands/
│   ├── validate.ts        # Command: validate existing YAMLs, report issues
│   ├── validate_test.ts   # Tests for validate command
│   ├── image-yaml.ts      # Command: generate missing image YAML templates
│   └── image-yaml_test.ts # Tests for image-yaml command
├── events/
│   ├── article.ts         # Kind 30023 event builder
│   ├── article_test.ts    # Tests for article events
│   ├── amb.ts             # Kind 30142 event builder (articles)
│   ├── amb_test.ts        # Tests for article AMB events
│   ├── image_amb.ts       # Kind 30142 event builder (images)
│   └── image_amb_test.ts  # Tests for image AMB events
├── sync.ts                # Command: sync (reads files, builds events, outputs)
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
│   │   └── ki-bild.png                     # Dummy image
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
    "validate": "deno run --allow-read --allow-env commands/validate.ts",
    "image-yaml": "deno run --allow-read --allow-write --allow-env commands/image-yaml.ts",
    "sync": "deno run --allow-read --allow-env sync.ts",
    "dry-run": "DRY_RUN=true deno run --allow-read --allow-env sync.ts",
    "test": "deno test --allow-read --allow-write"
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

### Task 4: Validator

**Files:**
- Create: `sync/validator.ts`
- Create: `sync/validator_test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// sync/validator_test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { validate, type ValidationResult } from "./validator.ts";
import type { CommonMetadata } from "./parser.ts";

const VALID_METADATA: CommonMetadata = {
  id: "https://oer.community/test-artikel",
  name: "Test Artikel",
  description: "Ein Test.",
  license: "https://creativecommons.org/licenses/by/4.0/deed.de",
  creator: [{ givenName: "Max", familyName: "Mustermann", type: "Person" }],
  inLanguage: ["de"],
  datePublished: "2025-09-11",
  keywords: ["Open Educational Resources (OER)"],
  type: "LearningResource",
};

Deno.test("validate returns ok for valid metadata", () => {
  const result = validate(VALID_METADATA);
  assertEquals(result.valid, true);
  assertEquals(result.errors, []);
});

Deno.test("validate catches missing id", () => {
  const result = validate({ ...VALID_METADATA, id: undefined });
  assertEquals(result.valid, false);
  assertEquals(result.errors.length > 0, true);
  assertEquals(result.errors[0].includes("id"), true);
});

Deno.test("validate catches id without oer.community prefix", () => {
  const result = validate({ ...VALID_METADATA, id: "https://example.com/test" });
  assertEquals(result.valid, false);
  assertEquals(result.errors[0].includes("id"), true);
});

Deno.test("validate catches missing name", () => {
  const result = validate({ ...VALID_METADATA, name: undefined });
  assertEquals(result.valid, false);
});

Deno.test("validate catches missing description", () => {
  const result = validate({ ...VALID_METADATA, description: undefined });
  assertEquals(result.valid, false);
});

Deno.test("validate catches missing license", () => {
  const result = validate({ ...VALID_METADATA, license: undefined });
  assertEquals(result.valid, false);
});

Deno.test("validate catches empty creator array", () => {
  const result = validate({ ...VALID_METADATA, creator: [] });
  assertEquals(result.valid, false);
});

Deno.test("validate catches missing inLanguage", () => {
  const result = validate({ ...VALID_METADATA, inLanguage: undefined });
  assertEquals(result.valid, false);
});

Deno.test("validate catches missing datePublished", () => {
  const result = validate({ ...VALID_METADATA, datePublished: undefined });
  assertEquals(result.valid, false);
});

Deno.test("validate catches missing keywords", () => {
  const result = validate({ ...VALID_METADATA, keywords: undefined });
  assertEquals(result.valid, false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd sync && deno test validator_test.ts`

Expected: FAIL — `validate` not found.

- [ ] **Step 3: Write validator.ts**

```typescript
// sync/validator.ts
import type { CommonMetadata } from "./parser.ts";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

const KNOWN_LICENSES = [
  "https://creativecommons.org/publicdomain/zero/1.0/deed.de",
  "https://creativecommons.org/licenses/by/4.0/deed.de",
  "https://creativecommons.org/licenses/by-sa/4.0/deed.de",
  "https://creativecommons.org/licenses/by-nc/4.0/deed.de",
  "https://creativecommons.org/licenses/by-nc-sa/4.0/deed.de",
];

export function validate(metadata: CommonMetadata): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!metadata.id) {
    errors.push("Pflichtfeld fehlt: id");
  } else if (!metadata.id.startsWith("https://oer.community/")) {
    errors.push("id muss mit https://oer.community/ beginnen");
  }

  if (!metadata.name) {
    errors.push("Pflichtfeld fehlt: name");
  }

  if (!metadata.description) {
    errors.push("Pflichtfeld fehlt: description");
  }

  if (!metadata.license) {
    errors.push("Pflichtfeld fehlt: license");
  } else if (!KNOWN_LICENSES.includes(metadata.license)) {
    warnings.push(`Unbekannte Lizenz: ${metadata.license}`);
  }

  if (!metadata.creator || metadata.creator.length === 0) {
    errors.push("Pflichtfeld fehlt: creator (mindestens ein Eintrag)");
  }

  if (!metadata.inLanguage || metadata.inLanguage.length === 0) {
    errors.push("Pflichtfeld fehlt: inLanguage");
  }

  if (!metadata.datePublished) {
    errors.push("Pflichtfeld fehlt: datePublished");
  }

  if (!metadata.keywords || metadata.keywords.length === 0) {
    errors.push("Pflichtfeld fehlt: keywords");
  }

  return { valid: errors.length === 0, errors, warnings };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd sync && deno test validator_test.ts`

Expected: 10 tests pass.

- [ ] **Step 5: Commit**

```bash
git add sync/validator.ts sync/validator_test.ts
git commit -m "feat(sync): add metadata validator with Pflichtfeld checks"
```

---

### Task 5: Content discovery module (shared)

**Files:**
- Create: `sync/discover.ts`
- Create: `sync/discover_test.ts`

Note: This task requires the testdata fixtures from Task 12. Create the fixture directories and `index.md` files first (Steps 1-4 of Task 12), then return here to test.

- [ ] **Step 1: Write the failing test**

```typescript
// sync/discover_test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { discoverContent, type ContentFile } from "./discover.ts";

Deno.test("discoverContent finds posts and pages in testdata", async () => {
  const files = await discoverContent("./testdata/content");

  const posts = files.filter((f) => f.type === "post");
  const pages = files.filter((f) => f.type === "page");

  assertEquals(posts.length, 2);
  assertEquals(pages.length >= 2, true); // impressum + missing-fields

  const dePost = posts.find((f) => f.lang === "de");
  const enPost = posts.find((f) => f.lang === "en");
  assertEquals(dePost !== undefined, true);
  assertEquals(enPost !== undefined, true);
});

Deno.test("discoverContent returns correct paths for posts", async () => {
  const files = await discoverContent("./testdata/content");
  const dePost = files.find((f) => f.lang === "de" && f.type === "post");
  assertEquals(dePost!.path.endsWith("index.md"), true);
  assertEquals(dePost!.path.includes("posts/de/"), true);
});

Deno.test("discoverContent returns correct paths for pages", async () => {
  const files = await discoverContent("./testdata/content");
  const impressum = files.find((f) => f.path.includes("impressum"));
  assertEquals(impressum!.type, "page");
  assertEquals(impressum!.lang, undefined);
});

Deno.test("discoverContent skips posts directory as page", async () => {
  const files = await discoverContent("./testdata/content");
  const postsPage = files.find((f) => f.type === "page" && f.path.includes("/posts/"));
  assertEquals(postsPage, undefined);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd sync && deno test discover_test.ts --allow-read`

Expected: FAIL — `discoverContent` not found.

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

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd sync && deno test discover_test.ts --allow-read`

Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add sync/discover.ts sync/discover_test.ts
git commit -m "feat(sync): add content discovery module"
```

---

### Task 6: Validate command — YAML frontmatter validation report

**Files:**
- Create: `sync/commands/validate.ts`
- Create: `sync/commands/validate_test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// sync/commands/validate_test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { validateDirectory, type ValidationReport } from "./validate.ts";

Deno.test("validateDirectory reports valid post as ok", async () => {
  const report = await validateDirectory("../testdata/content");
  const artikel = report.results.find((r) => r.slug === "test-artikel");
  assertEquals(artikel !== undefined, true);
  assertEquals(artikel!.status, "ok");
  assertEquals(artikel!.errors, []);
});

Deno.test("validateDirectory reports missing fields as error", async () => {
  const report = await validateDirectory("../testdata/content");
  const invalid = report.results.find((r) => r.path.includes("missing-fields"));
  assertEquals(invalid !== undefined, true);
  assertEquals(invalid!.status, "error");
  assertEquals(invalid!.errors.length > 0, true);
});

Deno.test("validateDirectory checks id/name/description consistency", async () => {
  const report = await validateDirectory("../testdata/content");
  const artikel = report.results.find((r) => r.slug === "test-artikel");
  assertEquals(artikel!.consistencyErrors, []);
});

Deno.test("validateDirectory counts totals", async () => {
  const report = await validateDirectory("../testdata/content");
  assertEquals(report.totalFiles > 0, true);
  assertEquals(report.validCount + report.errorCount, report.totalFiles);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd sync && deno test commands/validate_test.ts --allow-read`

Expected: FAIL — `validateDirectory` not found.

- [ ] **Step 3: Write validate.ts**

```typescript
// sync/commands/validate.ts
import { loadConfig } from "../config.ts";
import { discoverContent } from "../discover.ts";
import { parseMarkdown } from "../parser.ts";
import { validate } from "../validator.ts";
import { extractSlug } from "../events/article.ts";

export interface FileValidationResult {
  path: string;
  slug: string;
  status: "ok" | "error";
  errors: string[];
  warnings: string[];
  consistencyErrors: string[];
  type?: string;
  hasKeywords: boolean;
}

export interface ValidationReport {
  results: FileValidationResult[];
  totalFiles: number;
  validCount: number;
  errorCount: number;
}

function checkConsistency(metadata: Record<string, unknown>): string[] {
  const errors: string[] = [];
  const id = metadata.id as string | undefined;
  const name = metadata.name as string | undefined;
  const description = metadata.description as string | undefined;

  // Check id format
  if (id && !id.startsWith("https://oer.community/")) {
    errors.push(`id muss mit https://oer.community/ beginnen, ist: ${id}`);
  }

  // Check datePublished format
  const dp = metadata.datePublished as string | undefined;
  if (dp && !/^\d{4}-\d{2}-\d{2}$/.test(dp)) {
    errors.push(`datePublished muss YYYY-MM-DD sein, ist: ${dp}`);
  }

  // Check image URL consistency with id
  const image = metadata.image as string | undefined;
  if (id && image && !image.startsWith(id)) {
    errors.push(`image URL (${image}) sollte mit id (${id}) beginnen`);
  }

  return errors;
}

export async function validateDirectory(contentDir: string): Promise<ValidationReport> {
  // Import discoverContent dynamically to avoid circular deps in tests
  const files = await discoverContent(contentDir);
  const results: FileValidationResult[] = [];

  for (const file of files) {
    let markdown: string;
    try {
      markdown = Deno.readTextFileSync(file.path);
    } catch {
      results.push({
        path: file.path, slug: file.path, status: "error",
        errors: ["Datei nicht lesbar"], warnings: [], consistencyErrors: [],
        hasKeywords: false,
      });
      continue;
    }

    const parsed = parseMarkdown(markdown);
    if (!parsed) {
      results.push({
        path: file.path, slug: file.path, status: "error",
        errors: ["Kein YAML-Frontmatter gefunden"], warnings: [], consistencyErrors: [],
        hasKeywords: false,
      });
      continue;
    }

    const validation = validate(parsed.metadata);
    const consistencyErrors = checkConsistency(parsed.metadata as unknown as Record<string, unknown>);
    const slug = parsed.metadata.id ? extractSlug(parsed.metadata.id) : file.path;
    const allErrors = [...validation.errors, ...consistencyErrors];

    results.push({
      path: file.path,
      slug,
      status: allErrors.length === 0 ? "ok" : "error",
      errors: validation.errors,
      warnings: validation.warnings,
      consistencyErrors,
      type: parsed.metadata.type,
      hasKeywords: (parsed.metadata.keywords?.length ?? 0) > 0,
    });
  }

  const validCount = results.filter((r) => r.status === "ok").length;

  return {
    results,
    totalFiles: results.length,
    validCount,
    errorCount: results.length - validCount,
  };
}

// CLI entry point
if (import.meta.main) {
  const config = loadConfig();
  console.log("YAML Frontmatter Validierung");
  console.log(`Content-Verzeichnis: ${config.contentDir}\n`);

  const report = await validateDirectory(config.contentDir);

  for (const r of report.results) {
    if (r.status === "ok") {
      const typeInfo = r.type === "LearningResource" ? " [LearningResource]" : " [kein AMB]";
      const kwInfo = r.hasKeywords ? "" : " ⚠️ keine keywords";
      console.log(`✅ ${r.slug}${typeInfo}${kwInfo}`);
    } else {
      console.log(`❌ ${r.slug}`);
      for (const e of r.errors) console.log(`   Fehler: ${e}`);
      for (const e of r.consistencyErrors) console.log(`   Konsistenz: ${e}`);
    }
    for (const w of r.warnings) console.log(`   ⚠️  ${w}`);
  }

  console.log(`\n--- Zusammenfassung ---`);
  console.log(`✅ ${report.validCount} / ${report.totalFiles} valide`);
  if (report.errorCount > 0) console.log(`❌ ${report.errorCount} mit Fehlern`);
}
```

Note: This has a dependency on `discoverContent` from `sync.ts` and `extractSlug` from `events/article.ts`. Since Task 5 runs after Tasks 3-4 but before the event builders, we need `discoverContent` to exist. We'll extract it to a shared module in the sync orchestrator task, or accept the forward dependency — the validate command will be fully testable once sync.ts exists. For now, the test uses the testdata fixtures which are created in Task 9.

**Workaround for forward dependency:** Extract `discoverContent` into its own module. But to keep changes minimal, we'll write validate.ts with the import and test it after sync.ts is created. The test fixtures from Task 7 (image sidecar) are already available.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd sync && deno test commands/validate_test.ts --allow-read`

Expected: 4 tests pass. (Note: requires testdata from Task 9 Step 1-4 to exist. Create those fixture files first if running out of order.)

- [ ] **Step 5: Commit**

```bash
git add sync/commands/validate.ts sync/commands/validate_test.ts
git commit -m "feat(sync): add validate command for YAML frontmatter checking"
```

---

### Task 7: Image-yaml command — generate missing sidecar templates

**Files:**
- Create: `sync/commands/image-yaml.ts`
- Create: `sync/commands/image-yaml_test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// sync/commands/image-yaml_test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { generateImageYamlTemplate, scanForMissingImageYamls, type MissingImageYaml } from "./image-yaml.ts";

Deno.test("generateImageYamlTemplate creates valid YAML content", () => {
  const yaml = generateImageYamlTemplate("cover.jpg");
  assertEquals(yaml.includes("name:"), true);
  assertEquals(yaml.includes("license:"), true);
  assertEquals(yaml.includes("TODO"), true);
  assertEquals(yaml.includes("cover.jpg"), true);
});

Deno.test("scanForMissingImageYamls finds images without YAML", async () => {
  const missing = await scanForMissingImageYamls("../testdata/content");
  // diagram.png in test-artikel has no YAML sidecar
  const diagram = missing.find((m) => m.filename === "diagram.png");
  assertEquals(diagram !== undefined, true);
  assertEquals(diagram!.dirPath.includes("test-artikel"), true);
});

Deno.test("scanForMissingImageYamls does not report images with existing YAML", async () => {
  const missing = await scanForMissingImageYamls("../testdata/content");
  const cover = missing.find((m) => m.filename === "cover.jpg");
  assertEquals(cover, undefined); // cover.jpg already has cover.jpg.yaml
});

Deno.test("generateImageYamlTemplate writes to disk in write mode", async () => {
  const tmpDir = await Deno.makeTempDir();
  // Create a dummy image
  await Deno.writeTextFile(`${tmpDir}/test-img.png`, "");
  const outPath = `${tmpDir}/test-img.png.yaml`;

  const yaml = generateImageYamlTemplate("test-img.png");
  await Deno.writeTextFile(outPath, yaml);

  const content = await Deno.readTextFile(outPath);
  assertEquals(content.includes("name:"), true);
  assertEquals(content.includes("license:"), true);

  // Cleanup
  await Deno.remove(tmpDir, { recursive: true });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd sync && deno test commands/image-yaml_test.ts --allow-read --allow-write`

Expected: FAIL — `generateImageYamlTemplate` not found.

- [ ] **Step 3: Write image-yaml.ts**

```typescript
// sync/commands/image-yaml.ts
import { loadConfig } from "../config.ts";
import { discoverContent } from "../discover.ts";
import { discoverImages } from "../images.ts";
import { stringify } from "yaml";

export interface MissingImageYaml {
  filename: string;
  dirPath: string;
  yamlPath: string;
}

export function generateImageYamlTemplate(filename: string): string {
  const template = {
    name: `TODO: Beschreibung von ${filename}`,
    description: "TODO: Ausführliche Beschreibung",
    license: "TODO: https://creativecommons.org/licenses/by/4.0/",
    creator: {
      name: "TODO: Name des Urhebers",
    },
  };

  return `# Metadaten fuer ${filename}\n# Pflichtfelder: name, license\n# Alle TODO-Eintraege muessen manuell ausgefuellt werden\n${stringify(template)}`;
}

export async function scanForMissingImageYamls(contentDir: string): Promise<MissingImageYaml[]> {
  const files = await discoverContent(contentDir);
  const missing: MissingImageYaml[] = [];

  for (const file of files) {
    const dirPath = file.path.substring(0, file.path.lastIndexOf("/"));
    const images = await discoverImages(dirPath);

    for (const img of images) {
      if (!img.hasYaml) {
        missing.push({
          filename: img.filename,
          dirPath: img.dirPath,
          yamlPath: `${img.dirPath}/${img.filename}.yaml`,
        });
      }
    }
  }

  return missing;
}

// CLI entry point
if (import.meta.main) {
  const config = loadConfig();
  const dryRun = config.dryRun;
  console.log(`Bild-YAML-Generator${dryRun ? " (DRY RUN)" : ""}`);
  console.log(`Content-Verzeichnis: ${config.contentDir}\n`);

  const missing = await scanForMissingImageYamls(config.contentDir);

  if (missing.length === 0) {
    console.log("✅ Alle Bilder haben YAML-Sidecars.");
    Deno.exit(0);
  }

  console.log(`${missing.length} Bilder ohne YAML-Sidecar gefunden:\n`);

  for (const m of missing) {
    if (dryRun) {
      console.log(`   📝 Würde erstellen: ${m.yamlPath}`);
    } else {
      const yaml = generateImageYamlTemplate(m.filename);
      await Deno.writeTextFile(m.yamlPath, yaml);
      console.log(`   ✅ Erstellt: ${m.yamlPath}`);
    }
  }

  console.log(`\n--- Zusammenfassung ---`);
  console.log(`📝 ${missing.length} Templates ${dryRun ? "würden erstellt" : "erstellt"}`);
  if (!dryRun) {
    console.log("⚠️  Bitte alle TODO-Einträge manuell ausfüllen!");
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd sync && deno test commands/image-yaml_test.ts --allow-read --allow-write`

Expected: 4 tests pass. (Note: requires testdata from Task 9 fixtures.)

- [ ] **Step 5: Commit**

```bash
git add sync/commands/image-yaml.ts sync/commands/image-yaml_test.ts
git commit -m "feat(sync): add image-yaml command to generate missing sidecar templates"
```

---

### Task 8: Kind 30023 event builder

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

  const aboutTags = getTags("about");
  assertEquals(aboutTags.length, 1);
  assertEquals(aboutTags[0][1], "https://w3id.org/kim/hochschulfaechersystematik/n052");

  const tTags = getTags("t");
  assertEquals(tTags.length, 2);
  assertEquals(tTags[0][1], "Open Educational Resources (OER)");
  assertEquals(tTags[1][1], "Community");
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

### Task 9: Kind 30142 AMB event builder

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
  assertEquals(getTags("learningResourceType:id")[0][1], "https://w3id.org/kim/hcrt/text");
  assertEquals(getTags("learningResourceType:id")[1][1], "https://w3id.org/kim/hcrt/web_page");

  assertEquals(getTags("educationalLevel:id").length, 1);
  assertEquals(getTags("educationalLevel:id")[0][1], "https://w3id.org/kim/educationalLevel/level_A");

  assertEquals(getTags("about:id").length, 1);
  assertEquals(getTags("about:id")[0][1], "https://w3id.org/kim/hochschulfaechersystematik/n052");
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
  assertEquals(tTags[0][1], "Open Educational Resources (OER)");
  assertEquals(tTags[1][1], "Community");
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
  const lang = metadata.inLanguage?.[0] ?? "de";

  const tags: string[][] = [
    ["d", slug],
    ["type", metadata.type ?? "LearningResource"],
    ["name", metadata.name!],
    ["description", metadata.description!],
  ];

  // License
  if (metadata.license) {
    tags.push(["license:id", metadata.license]);
  }

  // Creators (flattened per NIP-AMB)
  if (metadata.creator) {
    for (const creator of metadata.creator) {
      tags.push(["creator:name", `${creator.givenName} ${creator.familyName}`]);
      if (creator.type) {
        tags.push(["creator:type", creator.type]);
      }
      if (creator.id) {
        tags.push(["creator:id", creator.id]);
      }
      if (creator.affiliation) {
        tags.push(["creator:affiliation:name", creator.affiliation.name]);
        if (creator.affiliation.id) {
          tags.push(["creator:affiliation:id", creator.affiliation.id]);
        }
      }
    }
  }

  // Language
  if (metadata.inLanguage) {
    for (const lang of metadata.inLanguage) {
      tags.push(["inLanguage", lang]);
    }
  }

  // Educational metadata (flattened)
  if (metadata.about) {
    for (const uri of metadata.about) {
      tags.push(["about:id", uri]);
    }
  }

  if (metadata.learningResourceType) {
    for (const uri of metadata.learningResourceType) {
      tags.push(["learningResourceType:id", uri]);
    }
  }

  if (metadata.educationalLevel) {
    for (const uri of metadata.educationalLevel) {
      tags.push(["educationalLevel:id", uri]);
    }
  }

  // Dates
  if (metadata.datePublished) {
    tags.push(["datePublished", metadata.datePublished]);
  }

  // Image
  if (metadata.image) {
    tags.push(["image", metadata.image]);
  }

  // Keywords as t-tags
  if (metadata.keywords) {
    for (const kw of metadata.keywords) {
      tags.push(["t", kw]);
    }
  }

  // Content reference
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

### Task 10: Image YAML sidecar discovery and parsing

**Files:**
- Create: `sync/images.ts`
- Create: `sync/images_test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// sync/images_test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { discoverImages, parseImageYaml, validateImageMeta, type ImageMeta } from "./images.ts";

Deno.test("discoverImages finds images with and without YAML sidecars", async () => {
  const images = await discoverImages("./testdata/content/posts/de/2025-09-11-test-artikel");

  assertEquals(images.length, 3);

  const cover = images.find((i) => i.filename === "cover.jpg");
  assertEquals(cover !== undefined, true);
  assertEquals(cover!.hasYaml, true);
  assertEquals(cover!.yamlPath, "./testdata/content/posts/de/2025-09-11-test-artikel/cover.jpg.yaml");

  const diagram = images.find((i) => i.filename === "diagram.png");
  assertEquals(diagram !== undefined, true);
  assertEquals(diagram!.hasYaml, false);

  const kiBild = images.find((i) => i.filename === "ki-bild.png");
  assertEquals(kiBild !== undefined, true);
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
  assertEquals(meta !== null, true);
  assertEquals(meta!.name, "Testbild Cover");
  assertEquals(meta!.license, "https://creativecommons.org/licenses/by-sa/4.0/");
  assertEquals(meta!.creator?.name, "Fotografin Schmidt");
});

Deno.test("parseImageYaml reads CC0 image without creator", () => {
  const meta = parseImageYaml("./testdata/content/posts/de/2025-09-11-test-artikel/ki-bild.png.yaml");
  assertEquals(meta !== null, true);
  assertEquals(meta!.license, "https://creativecommons.org/publicdomain/zero/1.0/");
  assertEquals(meta!.creator, undefined);
});

Deno.test("validateImageMeta returns valid for complete metadata", () => {
  const result = validateImageMeta({ name: "Test", license: "https://creativecommons.org/licenses/by/4.0/" });
  assertEquals(result.valid, true);
  assertEquals(result.errors, []);
});

Deno.test("validateImageMeta catches missing license", () => {
  const result = validateImageMeta({ name: "Test" } as ImageMeta);
  assertEquals(result.valid, false);
  assertEquals(result.errors[0].includes("license"), true);
});

Deno.test("validateImageMeta catches missing name", () => {
  const result = validateImageMeta({ license: "https://creativecommons.org/licenses/by/4.0/" } as ImageMeta);
  assertEquals(result.valid, false);
  assertEquals(result.errors[0].includes("name"), true);
});
```

- [ ] **Step 2: Create test fixture — cover.jpg.yaml**

```yaml
# sync/testdata/content/posts/de/2025-09-11-test-artikel/cover.jpg.yaml
name: "Testbild Cover"
description: "Ein Testbild fuer den Artikel"
creator:
  name: "Fotografin Schmidt"
  id: "https://orcid.org/0000-0001-2345-6789"
license: "https://creativecommons.org/licenses/by-sa/4.0/"
```

- [ ] **Step 3: Create test fixture — ki-bild.png.yaml**

```yaml
# sync/testdata/content/posts/de/2025-09-11-test-artikel/ki-bild.png.yaml
name: "KI-generierte Illustration"
description: "Erstellt mit Gemini ImageFX"
license: "https://creativecommons.org/publicdomain/zero/1.0/"
```

- [ ] **Step 4: Create dummy image files (empty, just for discovery)**

Run:
```bash
touch sync/testdata/content/posts/de/2025-09-11-test-artikel/cover.jpg
touch sync/testdata/content/posts/de/2025-09-11-test-artikel/diagram.png
touch sync/testdata/content/posts/de/2025-09-11-test-artikel/ki-bild.png
```

- [ ] **Step 5: Run test to verify it fails**

Run: `cd sync && deno test images_test.ts --allow-read`

Expected: FAIL — `discoverImages` not found.

- [ ] **Step 6: Write images.ts**

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

export interface ImageValidationResult {
  valid: boolean;
  errors: string[];
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

export function validateImageMeta(meta: ImageMeta): ImageValidationResult {
  const errors: string[] = [];

  if (!meta.name) {
    errors.push("Pflichtfeld fehlt: name");
  }

  if (!meta.license) {
    errors.push("Pflichtfeld fehlt: license");
  }

  return { valid: errors.length === 0, errors };
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd sync && deno test images_test.ts --allow-read`

Expected: 7 tests pass.

- [ ] **Step 8: Commit**

```bash
git add sync/images.ts sync/images_test.ts sync/testdata/content/posts/de/2025-09-11-test-artikel/cover.jpg sync/testdata/content/posts/de/2025-09-11-test-artikel/cover.jpg.yaml sync/testdata/content/posts/de/2025-09-11-test-artikel/diagram.png sync/testdata/content/posts/de/2025-09-11-test-artikel/ki-bild.png sync/testdata/content/posts/de/2025-09-11-test-artikel/ki-bild.png.yaml
git commit -m "feat(sync): add image YAML sidecar discovery and parsing"
```

---

### Task 11: Kind 30142 image AMB event builder

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
  creator: {
    name: "Fotografin Schmidt",
    id: "https://orcid.org/0000-0001-2345-6789",
  },
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
  const creatorName = event.tags.find((t: string[]) => t[0] === "creator:name");
  const creatorId = event.tags.find((t: string[]) => t[0] === "creator:id");
  assertEquals(creatorName?.[1], "Fotografin Schmidt");
  assertEquals(creatorId?.[1], "https://orcid.org/0000-0001-2345-6789");
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

Deno.test("buildImageAmbEvent includes inLanguage if set", () => {
  const event = buildImageAmbEvent(IMAGE_META, SLUG, FILENAME, PUBKEY);
  const lang = event.tags.find((t: string[]) => t[0] === "inLanguage");
  assertEquals(lang?.[1], "de");
});

Deno.test("buildImageAmbEvent omits creator for CC0 image without creator", () => {
  const cc0Meta: ImageMeta = {
    name: "KI-Bild",
    license: "https://creativecommons.org/publicdomain/zero/1.0/",
  };
  const event = buildImageAmbEvent(cc0Meta, SLUG, FILENAME, PUBKEY);
  const creatorTag = event.tags.find((t: string[]) => t[0] === "creator:name");
  assertEquals(creatorTag, undefined);
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

  if (meta.description) {
    tags.push(["description", meta.description]);
  }

  // License
  tags.push(["license:id", meta.license]);

  // Creator (optional, e.g. not for CC0/AI-generated)
  if (meta.creator) {
    tags.push(["creator:name", meta.creator.name]);
    if (meta.creator.id) {
      tags.push(["creator:id", meta.creator.id]);
    }
  }

  // Language (optional)
  if (meta.inLanguage) {
    tags.push(["inLanguage", meta.inLanguage]);
  }

  // Dates (optional)
  if (meta.dateCreated) {
    tags.push(["dateCreated", meta.dateCreated]);
  }
  if (meta.datePublished) {
    tags.push(["datePublished", meta.datePublished]);
  }

  // Fixed image-specific tags
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

Run: `cd sync && deno test events/image_amb_test.ts --allow-read`

Expected: 8 tests pass.

- [ ] **Step 5: Commit**

```bash
git add sync/events/image_amb.ts sync/events/image_amb_test.ts
git commit -m "feat(sync): add Kind 30142 image AMB event builder"
```

---

### Task 12: Sync orchestrator with dry-run output (including images)

**Files:**
- Create: `sync/sync.ts`
- Create: `sync/sync_test.ts`
- Create: `sync/testdata/content/posts/de/2025-09-11-test-artikel/index.md`
- Create: `sync/testdata/content/posts/en/2025-09-11-test-article-en/index.md`
- Create: `sync/testdata/content/impressum/index.md`
- Create: `sync/testdata/content/missing-fields/index.md`

- [ ] **Step 1: Create test fixture — valid German post**

```markdown
// sync/testdata/content/posts/de/2025-09-11-test-artikel/index.md
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

- [ ] **Step 2: Create test fixture — valid English post**

```markdown
// sync/testdata/content/posts/en/2025-09-11-test-article-en/index.md
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

- [ ] **Step 3: Create test fixture — page without LearningResource**

```markdown
// sync/testdata/content/impressum/index.md
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

- [ ] **Step 4: Create test fixture — missing required fields**

```markdown
// sync/testdata/content/missing-fields/index.md
---
# commonMetadata
name: 'Unvollständig'

# staticSiteGenerator
title: 'Unvollständig'
---
Inhalt ohne gültiges YAML.
```

- [ ] **Step 5: Write the failing integration test**

```typescript
// sync/sync_test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { discoverContent } from "./discover.ts";
import { processContent, type SyncResult } from "./sync.ts";

Deno.test("discoverContent finds posts and pages in testdata", async () => {
  const files = await discoverContent("./testdata/content");

  const posts = files.filter((f) => f.type === "post");
  const pages = files.filter((f) => f.type === "page");

  assertEquals(posts.length, 2);
  assertEquals(pages.length >= 2, true); // impressum + missing-fields

  // Check that posts have correct language
  const dePost = posts.find((f) => f.lang === "de");
  const enPost = posts.find((f) => f.lang === "en");
  assertEquals(dePost !== undefined, true);
  assertEquals(enPost !== undefined, true);
});

Deno.test("processContent returns events for valid LearningResource", async () => {
  const files = await discoverContent("./testdata/content");
  const validPost = files.find((f) => f.path.includes("test-artikel") && f.lang === "de")!;

  const result = await processContent(validPost, "testpubkey", "wss://content/", "wss://amb/");

  assertEquals(result.status, "ok");
  assertEquals(result.articleEvent !== null, true);
  assertEquals(result.ambEvent !== null, true);
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

  assertEquals(result.status, "ok");
  // cover.jpg has YAML → image AMB event, ki-bild.png has YAML → image AMB event
  // diagram.png has NO YAML → warning, no event
  assertEquals(result.imageAmbEvents.length, 2);
  assertEquals(result.imageAmbEvents[0].kind, 30142);
  assertEquals(result.imageWarnings.length, 1); // diagram.png missing YAML
  assertEquals(result.imageWarnings[0].includes("diagram.png"), true);
});

Deno.test("processContent returns no image events for page without images", async () => {
  const files = await discoverContent("./testdata/content");
  const impressum = files.find((f) => f.path.includes("impressum"))!;

  const result = await processContent(impressum, "testpubkey", "wss://content/", "wss://amb/");

  assertEquals(result.imageAmbEvents.length, 0);
  assertEquals(result.imageWarnings.length, 0);
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd sync && deno test sync_test.ts --allow-read`

Expected: FAIL — `discoverContent` not found.

- [ ] **Step 7: Write sync.ts**

```typescript
// sync/sync.ts
import { loadConfig } from "./config.ts";
import { discoverContent, type ContentFile } from "./discover.ts";
import { parseMarkdown } from "./parser.ts";
import { validate } from "./validator.ts";
import { buildArticleEvent, extractSlug, type UnsignedEvent } from "./events/article.ts";
import { buildAmbEvent } from "./events/amb.ts";
import { buildImageAmbEvent } from "./events/image_amb.ts";
import { discoverImages, parseImageYaml, validateImageMeta } from "./images.ts";

export interface SyncResult {
  slug: string;
  status: "ok" | "error" | "skipped";
  articleEvent: UnsignedEvent | null;
  ambEvent: UnsignedEvent | null;
  imageAmbEvents: UnsignedEvent[];
  imageWarnings: string[];
  errors: string[];
  warnings: string[];
}

export async function processContent(
  file: ContentFile,
  pubkey: string,
  contentRelay: string,
  ambRelay: string,
): Promise<SyncResult> {
  let markdown: string;
  try {
    markdown = Deno.readTextFileSync(file.path);
  } catch (e) {
    return {
      slug: file.path, status: "error",
      articleEvent: null, ambEvent: null,
      imageAmbEvents: [], imageWarnings: [],
      errors: [`Datei nicht lesbar: ${e}`], warnings: [],
    };
  }

  const parsed = parseMarkdown(markdown);
  if (!parsed) {
    return {
      slug: file.path, status: "error",
      articleEvent: null, ambEvent: null,
      imageAmbEvents: [], imageWarnings: [],
      errors: ["Kein YAML-Frontmatter gefunden"], warnings: [],
    };
  }

  const validation = validate(parsed.metadata);
  if (!validation.valid) {
    return {
      slug: parsed.metadata.id ?? file.path, status: "error",
      articleEvent: null, ambEvent: null,
      imageAmbEvents: [], imageWarnings: [],
      errors: validation.errors, warnings: validation.warnings,
    };
  }

  const articleEvent = buildArticleEvent(parsed.metadata, parsed.content, pubkey, ambRelay);

  let ambEvent: UnsignedEvent | null = null;
  if (parsed.metadata.type === "LearningResource") {
    ambEvent = buildAmbEvent(parsed.metadata, pubkey, contentRelay);
  }

  const slug = articleEvent.tags.find((t) => t[0] === "d")?.[1] ?? file.path;

  // Discover and process images in the same directory
  const dirPath = file.path.substring(0, file.path.lastIndexOf("/"));
  const imageFiles = await discoverImages(dirPath);
  const imageAmbEvents: UnsignedEvent[] = [];
  const imageWarnings: string[] = [];

  for (const img of imageFiles) {
    if (!img.hasYaml) {
      imageWarnings.push(`${img.filename} — KEINE .yaml Datei! Fehlende Lizenzangabe!`);
      continue;
    }

    const meta = parseImageYaml(img.yamlPath!);
    if (!meta) {
      imageWarnings.push(`${img.filename} — .yaml Datei nicht lesbar`);
      continue;
    }

    const imgValidation = validateImageMeta(meta);
    if (!imgValidation.valid) {
      imageWarnings.push(`${img.filename} — ${imgValidation.errors.join(", ")}`);
      continue;
    }

    imageAmbEvents.push(buildImageAmbEvent(meta, slug, img.filename, pubkey));
  }

  return {
    slug,
    status: "ok",
    articleEvent,
    ambEvent,
    imageAmbEvents,
    imageWarnings,
    errors: [],
    warnings: validation.warnings,
  };
}

function formatResult(result: SyncResult): string {
  if (result.status === "error") {
    return `❌ ${result.slug} — ${result.errors.join(", ")}`;
  }
  const parts = ["30023"];
  if (result.ambEvent) parts.push("30142");
  if (result.imageAmbEvents.length > 0) {
    parts.push(`${result.imageAmbEvents.length} Bild-AMB`);
  }
  const prefix = result.ambEvent ? "✅" : "ℹ️ ";
  const suffix = !result.ambEvent ? " (kein AMB — type ist nicht LearningResource)" : "";
  return `${prefix} ${result.slug} (${parts.join(" + ")})${suffix}`;
}

// Main entry point
if (import.meta.main) {
  const config = loadConfig();
  console.log(`md-to-nostr sync${config.dryRun ? " (DRY RUN)" : ""}`);
  console.log(`Content-Verzeichnis: ${config.contentDir}`);
  console.log("");

  const files = await discoverContent(config.contentDir);
  console.log(`${files.length} Dateien gefunden\n`);

  let okCount = 0;
  let ambCount = 0;
  let imageAmbCount = 0;
  let errorCount = 0;

  for (const file of files) {
    const result = await processContent(file, config.pubkey, config.contentRelay, config.ambRelay);
    console.log(formatResult(result));

    if (result.warnings.length > 0) {
      for (const w of result.warnings) {
        console.log(`   ⚠️  ${w}`);
      }
    }

    for (const w of result.imageWarnings) {
      console.log(`   ⚠️  ${w}`);
    }

    if (config.dryRun && result.articleEvent) {
      console.log(`   30023 tags: ${JSON.stringify(result.articleEvent.tags)}`);
      if (result.ambEvent) {
        console.log(`   30142 tags: ${JSON.stringify(result.ambEvent.tags)}`);
      }
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

- [ ] **Step 8: Run integration tests**

Run: `cd sync && deno test sync_test.ts --allow-read`

Expected: 6 tests pass.

- [ ] **Step 9: Run all tests together**

Run: `cd sync && deno test --allow-read`

Expected: All tests pass (4 + 10 + 4 + 4 + 4 + 4 + 8 + 7 + 8 + 6 = 59 tests).

- [ ] **Step 10: Commit**

```bash
git add sync/sync.ts sync/sync_test.ts sync/testdata/
git commit -m "feat(sync): add sync orchestrator with image AMB support and dry-run"
```

---

### Task 13: End-to-end dry-run test

**Files:**
- No new files — manual verification with testdata

- [ ] **Step 1: Run dry-run against testdata**

Run: `cd sync && CONTENT_DIR=./testdata/content DRY_RUN=true deno task sync`

Expected output (approximate):
```
md-to-nostr sync (DRY RUN)
Content-Verzeichnis: ./testdata/content

4 Dateien gefunden

✅ test-artikel (30023 + 30142 + 2 Bild-AMB)
   30023 tags: [["d","test-artikel"],["title","Test Artikel"],...]
   30142 tags: [["d","test-artikel"],["type","LearningResource"],...]
   30142 (Bild) d: https://oer.community/test-artikel/cover.jpg
   30142 (Bild) d: https://oer.community/test-artikel/ki-bild.png
   ⚠️  diagram.png — KEINE .yaml Datei! Fehlende Lizenzangabe!
✅ test-article-en (30023 + 30142)
   30023 tags: [...]
   30142 tags: [...]
ℹ️  impressum (30023) (kein AMB — type ist nicht LearningResource)
   30023 tags: [...]
❌ missing-fields/index.md — Pflichtfeld fehlt: id, ...

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
- Posts with `type: LearningResource` → 30023 + 30142 (article) + 30142 (images)
- Impressum (no type) → only 30023, no AMB, no image AMB
- missing-fields → error, no events

- [ ] **Step 4: Verify image warnings**

Check that:
- `diagram.png` generates a warning about missing `.yaml` file
- `cover.jpg` and `ki-bild.png` generate valid 30142 events

- [ ] **Step 5: Commit final state**

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
| 4 | Validator | 10 |
| 5 | Content discovery module (shared) | 4 |
| 6 | **Validate command** (`deno task validate`) | 4 |
| 7 | **Image-yaml command** (`deno task image-yaml`) | 4 |
| 8 | Kind 30023 event builder | 4 |
| 9 | Kind 30142 AMB event builder (articles) | 8 |
| 10 | Image YAML sidecar discovery + parsing | 7 |
| 11 | Kind 30142 image AMB event builder | 8 |
| 12 | Sync orchestrator + dry-run (with images) | 6 |
| 13 | E2E verification | manual |
| **Total** | | **59 tests** |

## Workflow

```
deno task validate     # Schritt 1: Alle YAMLs prüfen, Bericht ausgeben
deno task image-yaml   # Schritt 2: Fehlende Bild-YAMLs als Templates generieren
# → Manuell: TODO-Felder in generierten Templates ausfüllen
deno task dry-run      # Schritt 3: Events bauen und anzeigen (ohne Publish)
deno task sync         # Schritt 4: Events bauen und publizieren (live)
```
