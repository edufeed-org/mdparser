import { assertEquals } from 'jsr:@std/assert@^1.0.0'
import { parseMarkdown } from './parser.ts'

const HASH = 'a'.repeat(64)
const URL_ = `https://blossom.edufeed.org/${HASH}.jpeg`

const MIT_BILDERN = `---
# commonMetadata
id: https://oer.community/test
name: Test
image: ${URL_}

# staticSiteGenerator
title: Test
cover:
  relative: false
  image: ${URL_}

# bilder  (Konvention: bildattribution.md · Schlüssel = Dateiname oder Hash-URL)
bilder:
  "${URL_}":
    alt: Ein Schrein
    title: nosTr-schrein
    author: Comenius-Institut
    licenceUrl: https://creativecommons.org/publicdomain/zero/1.0/
---

Text.
`

Deno.test('parseMarkdown liest den # bilder-Block mit Konventionsnamen', () => {
  const p = parseMarkdown(MIT_BILDERN)
  assertEquals(p?.bilder?.[URL_]?.alt, 'Ein Schrein')
  assertEquals(p?.bilder?.[URL_]?.title, 'nosTr-schrein')
  assertEquals(p?.bilder?.[URL_]?.author, 'Comenius-Institut')
  assertEquals(
    p?.bilder?.[URL_]?.licenceUrl,
    'https://creativecommons.org/publicdomain/zero/1.0/',
  )
})

Deno.test('commonMetadata bleibt vom bilder-Block unberührt', () => {
  const p = parseMarkdown(MIT_BILDERN)
  assertEquals(p?.metadata.name, 'Test')
  assertEquals(p?.metadata.image, URL_)
  assertEquals((p?.metadata as Record<string, unknown>)['bilder'], undefined)
  assertEquals((p?.metadata as Record<string, unknown>)['cover'], undefined)
})

Deno.test('ohne # bilder-Block ist bilder undefined', () => {
  const p = parseMarkdown('---\n# commonMetadata\nname: X\n---\nText')
  assertEquals(p?.bilder, undefined)
  assertEquals(p?.metadata.name, 'X')
})

Deno.test('der Body bleibt vollständig erhalten', () => {
  const p = parseMarkdown(MIT_BILDERN)
  assertEquals(p?.content.trim(), 'Text.')
})

Deno.test('inLanguage als String wird zur Liste — sonst hieße die Sprache „d"', () => {
  const md = '---\n# commonMetadata\nid: https://oer.community/x\ninLanguage: de\n---\nText\n'
  assertEquals(parseMarkdown(md)?.metadata.inLanguage, ['de'])
  const liste = '---\n# commonMetadata\nid: https://oer.community/x\ninLanguage:\n  - en\n---\nText\n'
  assertEquals(parseMarkdown(liste)?.metadata.inLanguage, ['en'])
})
