import { assertEquals, assertStringIncludes } from 'jsr:@std/assert@^1.0.0'
import type { ContentFile } from './discover.ts'
import type { PostResult, PostStatus } from '../subcommands/publish.ts'
import { isSilentNoop, renderSummary, writeStepSummary } from './summary.ts'

function file(slug: string, lang = 'de'): ContentFile {
  return { path: `/content/${lang}/posts/${slug}/index.md`, slug, lang, type: 'post' }
}

function result(
  slug: string,
  status: PostStatus,
  extra: Partial<PostResult> = {},
): PostResult {
  return { file: file(slug), status, ...extra }
}

Deno.test('isSilentNoop — Dateien geändert, nichts publiziert → true', () => {
  const results = [
    result('a', 'skipped-missing-fields', { reason: 'Pflichtfelder fehlen: id' }),
    result('b', 'skipped-empty-frontmatter'),
  ]
  assertEquals(isSilentNoop(results), true)
})

Deno.test('isSilentNoop — mindestens ein ok → false', () => {
  const results = [
    result('a', 'skipped-missing-fields'),
    result('b', 'ok'),
  ]
  assertEquals(isSilentNoop(results), false)
})

Deno.test('isSilentNoop — leerer Lauf ist kein stiller Fehlschlag', () => {
  assertEquals(isSilentNoop([]), false)
})

Deno.test('renderSummary — stiller Fehlschlag erzeugt Warnung', () => {
  const md = renderSummary({
    mode: 'diff',
    dryRun: false,
    results: [result('a', 'skipped-missing-fields', { reason: 'Pflichtfelder fehlen: id' })],
  })
  assertStringIncludes(md, '[!WARNING]')
  assertStringIncludes(md, 'nichts publiziert')
  assertStringIncludes(md, 'de/a — Pflichtfelder fehlen: id')
})

Deno.test('renderSummary — erfolgreicher Lauf ohne Warnung', () => {
  const md = renderSummary({
    mode: 'diff',
    dryRun: false,
    results: [result('a', 'ok', {
      articleAcks: [
        { relay: 'wss://r1/', ok: true },
        { relay: 'wss://r2/', ok: true },
      ],
    })],
  })
  assertEquals(md.includes('[!WARNING]'), false)
  assertStringIncludes(md, 'de/a (2/2 acks)')
})

Deno.test('renderSummary — fehlende empfohlene Felder werden gelistet', () => {
  const md = renderSummary({
    mode: 'diff',
    dryRun: false,
    results: [result('a', 'ok', { missingRecommended: ['keywords'] })],
  })
  assertStringIncludes(md, 'Metadaten unvollstaendig')
  assertStringIncludes(md, 'de/a — fehlt: keywords')
})

Deno.test('renderSummary — dauerhaft stummes Relay wird sichtbar', () => {
  const acks = [
    { relay: 'wss://gut/', ok: true },
    { relay: 'wss://stumm/', ok: false },
  ]
  const md = renderSummary({
    mode: 'diff',
    dryRun: false,
    results: [
      result('a', 'ok', { articleAcks: acks }),
      result('b', 'ok', { articleAcks: acks }),
    ],
  })
  assertStringIncludes(md, 'Relays ohne Bestaetigung')
  assertStringIncludes(md, '`wss://stumm/` — 2/2 Events nicht bestaetigt')
  assertEquals(md.includes('`wss://gut/`'), false)
})

Deno.test('writeStepSummary — ohne GITHUB_STEP_SUMMARY passiert nichts', async () => {
  const wrote = await writeStepSummary('# egal', () => undefined)
  assertEquals(wrote, false)
})

Deno.test('writeStepSummary — schreibt an die Datei aus der Env-Var', async () => {
  const tmp = await Deno.makeTempFile()
  try {
    const wrote = await writeStepSummary(
      '# hallo',
      (k) => k === 'GITHUB_STEP_SUMMARY' ? tmp : undefined,
    )
    assertEquals(wrote, true)
    assertStringIncludes(await Deno.readTextFile(tmp), '# hallo')
  } finally {
    await Deno.remove(tmp)
  }
})
