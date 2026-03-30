# md-to-nostr Dry-Run Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Deno-based sync script that reads local Markdown files, extracts commonMetadata, builds Kind 30023 and Kind 30142 Nostr events, and outputs them as JSON in dry-run mode.

**Architecture:** Modular Deno TypeScript — parser extracts YAML frontmatter, separate event builders for 30023 and 30142, orchestrator reads local files and pipes through the pipeline. No network access needed for dry-run. Follows wp-to-nostr patterns (env vars, `deno task` commands).

**Tech Stack:** Deno, TypeScript, `npm:yaml` for YAML parsing, `npm:nostr-tools` for event structure validation.

---

## File Structure

```
sync/
├── deno.json              # Deno config, tasks, imports
├── config.ts              # Configuration from env vars + defaults
├── parser.ts              # YAML frontmatter extraction (commonMetadata only)
├── parser_test.ts         # Tests for parser
├── validator.ts           # Pflichtfeld-Validierung
├── validator_test.ts      # Tests for validator
├── events/
│   ├── article.ts         # Kind 30023 event builder
│   ├── article_test.ts    # Tests for article events
│   ├── amb.ts             # Kind 30142 event builder
│   └── amb_test.ts        # Tests for AMB events
├── sync.ts                # Main orchestrator (reads files, builds events, outputs)
└── sync_test.ts           # Integration test with fixture files
```

**Test fixtures:**
```
sync/testdata/
├── content/
│   ├── posts/de/2025-09-11-oep-test/index.md    # Valid post with LearningResource
│   ├── posts/en/2025-09-11-oep-test-en/index.md # Valid English post
│   ├── impressum/index.md                        # Page without LearningResource
│   └── missing-fields/index.md                   # Invalid: missing required fields
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

### Task 6: Kind 30142 AMB event builder

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

### Task 7: Sync orchestrator with dry-run output

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
import { discoverContent, processContent, type ContentFile, type SyncResult } from "./sync.ts";

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

  const result = processContent(validPost, "testpubkey", "wss://content/", "wss://amb/");

  assertEquals(result.status, "ok");
  assertEquals(result.articleEvent !== null, true);
  assertEquals(result.ambEvent !== null, true);
  assertEquals(result.articleEvent!.kind, 30023);
  assertEquals(result.ambEvent!.kind, 30142);
});

Deno.test("processContent returns only article event for non-LearningResource", async () => {
  const files = await discoverContent("./testdata/content");
  const impressum = files.find((f) => f.path.includes("impressum"))!;

  const result = processContent(impressum, "testpubkey", "wss://content/", "wss://amb/");

  assertEquals(result.status, "ok");
  assertEquals(result.articleEvent !== null, true);
  assertEquals(result.ambEvent, null);
});

Deno.test("processContent returns error for missing fields", async () => {
  const files = await discoverContent("./testdata/content");
  const invalid = files.find((f) => f.path.includes("missing-fields"))!;

  const result = processContent(invalid, "testpubkey", "wss://content/", "wss://amb/");

  assertEquals(result.status, "error");
  assertEquals(result.errors.length > 0, true);
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd sync && deno test sync_test.ts --allow-read`

Expected: FAIL — `discoverContent` not found.

- [ ] **Step 7: Write sync.ts**

```typescript
// sync/sync.ts
import { loadConfig } from "./config.ts";
import { parseMarkdown, type ParsedMarkdown } from "./parser.ts";
import { validate } from "./validator.ts";
import { buildArticleEvent, type UnsignedEvent } from "./events/article.ts";
import { buildAmbEvent } from "./events/amb.ts";

export interface ContentFile {
  path: string;
  type: "post" | "page";
  lang?: string;
}

export interface SyncResult {
  slug: string;
  status: "ok" | "error" | "skipped";
  articleEvent: UnsignedEvent | null;
  ambEvent: UnsignedEvent | null;
  errors: string[];
  warnings: string[];
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

export function processContent(
  file: ContentFile,
  pubkey: string,
  contentRelay: string,
  ambRelay: string,
): SyncResult {
  let markdown: string;
  try {
    markdown = Deno.readTextFileSync(file.path);
  } catch (e) {
    return {
      slug: file.path,
      status: "error",
      articleEvent: null,
      ambEvent: null,
      errors: [`Datei nicht lesbar: ${e}`],
      warnings: [],
    };
  }

  const parsed = parseMarkdown(markdown);
  if (!parsed) {
    return {
      slug: file.path,
      status: "error",
      articleEvent: null,
      ambEvent: null,
      errors: ["Kein YAML-Frontmatter gefunden"],
      warnings: [],
    };
  }

  const validation = validate(parsed.metadata);
  if (!validation.valid) {
    return {
      slug: parsed.metadata.id ?? file.path,
      status: "error",
      articleEvent: null,
      ambEvent: null,
      errors: validation.errors,
      warnings: validation.warnings,
    };
  }

  const articleEvent = buildArticleEvent(parsed.metadata, parsed.content, pubkey, ambRelay);

  let ambEvent: UnsignedEvent | null = null;
  if (parsed.metadata.type === "LearningResource") {
    ambEvent = buildAmbEvent(parsed.metadata, pubkey, contentRelay);
  }

  const slug = articleEvent.tags.find((t) => t[0] === "d")?.[1] ?? file.path;

  return {
    slug,
    status: "ok",
    articleEvent,
    ambEvent,
    errors: [],
    warnings: validation.warnings,
  };
}

function formatResult(result: SyncResult): string {
  if (result.status === "error") {
    return `❌ ${result.slug} — ${result.errors.join(", ")}`;
  }
  if (result.ambEvent) {
    return `✅ ${result.slug} (30023 + 30142)`;
  }
  return `ℹ️  ${result.slug} (30023, kein AMB — type ist nicht LearningResource)`;
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
  let errorCount = 0;

  for (const file of files) {
    const result = processContent(file, config.pubkey, config.contentRelay, config.ambRelay);
    console.log(formatResult(result));

    if (result.warnings.length > 0) {
      for (const w of result.warnings) {
        console.log(`   ⚠️  ${w}`);
      }
    }

    if (config.dryRun && result.articleEvent) {
      console.log(`   30023 tags: ${JSON.stringify(result.articleEvent.tags)}`);
      if (result.ambEvent) {
        console.log(`   30142 tags: ${JSON.stringify(result.ambEvent.tags)}`);
      }
    }

    if (result.status === "ok") {
      okCount++;
      if (result.ambEvent) ambCount++;
    } else {
      errorCount++;
    }
  }

  console.log(`\n--- Zusammenfassung ---`);
  console.log(`✅ ${okCount} Events erstellt (davon ${ambCount} mit AMB)`);
  if (errorCount > 0) console.log(`❌ ${errorCount} Fehler`);

  if (!config.dryRun) {
    console.log("\n⚠️  Live-Modus: Relay-Publish noch nicht implementiert.");
  }
}
```

- [ ] **Step 8: Run integration tests**

Run: `cd sync && deno test sync_test.ts --allow-read`

Expected: 4 tests pass.

- [ ] **Step 9: Run all tests together**

Run: `cd sync && deno test --allow-read`

Expected: All tests pass (4 + 10 + 4 + 8 + 4 = 30 tests).

- [ ] **Step 10: Commit**

```bash
git add sync/sync.ts sync/sync_test.ts sync/testdata/
git commit -m "feat(sync): add sync orchestrator with dry-run and local file discovery"
```

---

### Task 8: End-to-end dry-run test

**Files:**
- No new files — manual verification with testdata

- [ ] **Step 1: Run dry-run against testdata**

Run: `cd sync && CONTENT_DIR=./testdata/content DRY_RUN=true deno task sync`

Expected output (approximate):
```
md-to-nostr sync (DRY RUN)
Content-Verzeichnis: ./testdata/content

4 Dateien gefunden

✅ test-artikel (30023 + 30142)
   30023 tags: [["d","test-artikel"],["title","Test Artikel"],...]
   30142 tags: [["d","test-artikel"],["type","LearningResource"],...]
✅ test-article-en (30023 + 30142)
   30023 tags: [...]
   30142 tags: [...]
ℹ️  impressum (30023, kein AMB — type ist nicht LearningResource)
   30023 tags: [...]
❌ missing-fields/index.md — Pflichtfeld fehlt: id, ...

--- Zusammenfassung ---
✅ 3 Events erstellt (davon 2 mit AMB)
❌ 1 Fehler
```

- [ ] **Step 2: Verify d-tags match expected slugs**

Check that:
- `test-artikel` d-tag comes from `id: https://oer.community/test-artikel`
- `test-article-en` d-tag comes from `id: https://oer.community/test-article-en`
- `impressum` d-tag comes from `id: https://oer.community/impressum`

- [ ] **Step 3: Verify AMB gating**

Check that:
- Posts with `type: LearningResource` → both 30023 + 30142
- Impressum (no type) → only 30023
- missing-fields → error, no events

- [ ] **Step 4: Commit final state**

```bash
git add -A sync/
git commit -m "feat(sync): complete dry-run implementation with local file support"
```

---

## Summary

| Task | What it builds | Tests |
|---|---|---|
| 1 | Deno project setup | — |
| 2 | Config module | — |
| 3 | YAML parser (commonMetadata) | 4 |
| 4 | Validator | 10 |
| 5 | Kind 30023 event builder | 4 |
| 6 | Kind 30142 AMB event builder | 8 |
| 7 | Sync orchestrator + dry-run | 4 |
| 8 | E2E verification | manual |
| **Total** | | **30 tests** |
