import { parseArgs } from 'jsr:@std/cli@^1.0.6/parse-args'
import { resolve } from 'jsr:@std/path@^1.0.0'
import { nip19 } from 'nostr-tools'
import { type Config, loadConfig } from '../core/config.ts'
import { parseMarkdown } from '../core/parser.ts'
import { validatePost } from '../core/validation.ts'
import { allContentFiles, type ContentFile } from '../core/discover.ts'
import { changedContentFiles } from '../core/change-detection.ts'
import { AMB_RELAYS, ARTICLE_RELAYS, type PublishResult, publishToRelays } from '../core/relays.ts'
import { createBunkerSigner, type Signer } from '../core/signer.ts'
import { buildArticleEvent } from '../events/article.ts'
import { buildAmbEvent } from '../events/amb.ts'
import { createLogger } from '../core/log.ts'
import { isSilentNoop, renderSummary, writeStepSummary } from '../core/summary.ts'
import {
  bilddateien,
  bilderSchritt,
  type BilderErgebnis,
  bildUrls,
  postDirVon,
  standardDeps,
} from '../core/bilder.ts'

const ARTICLE_HINT_RELAY = ARTICLE_RELAYS[0]
const AMB_HINT_RELAY = AMB_RELAYS[0]

export type PostStatus =
  | 'ok'
  | 'skipped-empty-frontmatter'
  | 'skipped-missing-fields'
  | 'failed-validation'
  | 'failed-publish'
  | 'failed-acks'

export interface PostResult {
  file: ContentFile
  status: PostStatus
  reason?: string
  /** Fehlende empfohlene Felder (z.B. keywords) — Post wurde trotzdem publiziert. */
  missingRecommended?: string[]
  articleEventId?: string
  ambEventId?: string
  articleAcks?: PublishResult[]
  ambAcks?: PublishResult[]
  /** Bilderschritt (core/bilder.ts): Uploads, Nachweise, Warnungen — blockiert nie. */
  bilder?: BilderErgebnis
}

function countOkAcks(results: PublishResult[] | undefined): number {
  if (!results) return 0
  return results.filter((r) => r.ok).length
}

export interface ProcessDeps {
  signer: Signer | null
  cfg: Config
  dryRun: boolean
}

export async function processPost(file: ContentFile, deps: ProcessDeps): Promise<PostResult> {
  const markdown = await Deno.readTextFile(file.path)
  const parsed = parseMarkdown(markdown)
  const validation = validatePost(parsed)

  if (validation.status === 'skip-empty-frontmatter') {
    return {
      file,
      status: 'skipped-empty-frontmatter',
      reason: validation.reason,
      missingRecommended: validation.missingRecommended,
    }
  }
  if (validation.status === 'skip-missing-fields') {
    return {
      file,
      status: 'skipped-missing-fields',
      reason: validation.reason,
      missingRecommended: validation.missingRecommended,
    }
  }
  if (validation.status === 'error' || parsed === null) {
    return {
      file,
      status: 'failed-validation',
      reason: validation.reason ?? 'unbekannter Validation-Fehler',
      missingRecommended: validation.missingRecommended,
    }
  }

  const missingRecommended = validation.missingRecommended

  const pubkey = deps.cfg.authorPubkeyHex

  // Bilderschritt: Blossom spiegelt Git. Zu jeder Hash-URL Blob sicherstellen und
  // den Nachweis aus dem # bilder-Block prägen. Warnungen halten das 30023 nicht
  // auf — die URL steht schon in Git, Git ist die Wahrheit.
  let bilder: BilderErgebnis | undefined
  if (bildUrls(parsed.metadata, parsed.content).length > 0) {
    const dateien = await bilddateien(postDirVon(file.path))
    bilder = await bilderSchritt(parsed, dateien, standardDeps(deps.signer, pubkey, deps.dryRun))
  }

  const article = buildArticleEvent(parsed.metadata, parsed.content, pubkey, AMB_HINT_RELAY, {
    seite: file.type === 'page',
  })
  const amb = parsed.metadata.type === 'LearningResource'
    ? buildAmbEvent(parsed.metadata, pubkey, ARTICLE_HINT_RELAY)
    : null

  if (deps.dryRun) {
    const dTag = article.tags.find((t) => t[0] === 'd')?.[1] ?? ''
    return {
      file,
      status: 'ok',
      missingRecommended,
      bilder,
      reason: `dry-run: würde 30023 (${dTag}) + ${
        amb ? '30142' : 'kein 30142'
      } an ${ARTICLE_RELAYS.length}/${AMB_RELAYS.length} Relays publishen`,
    }
  }

  if (!deps.signer) {
    return {
      file,
      status: 'failed-publish',
      missingRecommended,
      bilder,
      reason: 'kein Signer (live-Modus erfordert Bunker)',
    }
  }

  let signedArticle
  try {
    signedArticle = await deps.signer.signEvent(article)
  } catch (err) {
    return {
      file,
      status: 'failed-publish',
      reason: `signEvent (30023): ${err instanceof Error ? err.message : String(err)}`,
    }
  }

  const articleAcks = await publishToRelays(ARTICLE_RELAYS, signedArticle)
  const articleOk = countOkAcks(articleAcks)
  if (articleOk < deps.cfg.minRelayAcks) {
    return {
      file,
      status: 'failed-acks',
      reason:
        `30023: nur ${articleOk}/${ARTICLE_RELAYS.length} acks (min ${deps.cfg.minRelayAcks})`,
      articleEventId: signedArticle.id,
      articleAcks,
    }
  }

  let ambEventId: string | undefined
  let ambAcks: PublishResult[] | undefined
  if (amb) {
    let signedAmb
    try {
      signedAmb = await deps.signer.signEvent(amb)
    } catch (err) {
      return {
        file,
        status: 'failed-publish',
        reason: `signEvent (30142): ${err instanceof Error ? err.message : String(err)}`,
        articleEventId: signedArticle.id,
        articleAcks,
      }
    }
    ambEventId = signedAmb.id
    ambAcks = await publishToRelays(AMB_RELAYS, signedAmb)
    const ambOkCount = countOkAcks(ambAcks)
    if (ambOkCount === 0) {
      return {
        file,
        status: 'failed-acks',
        reason: `30142: 0/${AMB_RELAYS.length} acks`,
        articleEventId: signedArticle.id,
        articleAcks,
        ambEventId,
        ambAcks,
      }
    }
  }

  return {
    file,
    status: 'ok',
    missingRecommended,
    bilder,
    articleEventId: signedArticle.id,
    articleAcks,
    ambEventId,
    ambAcks,
  }
}

interface PublishFlags {
  'dry-run'?: boolean
  'force-all'?: boolean
  post?: string
  _: (string | number)[]
}

async function selectFiles(
  cfg: Config,
  flags: PublishFlags,
): Promise<ContentFile[]> {
  if (flags['force-all']) {
    return await allContentFiles(cfg.contentRoot)
  }

  if (typeof flags.post === 'string' && flags.post.length > 0) {
    const all = await allContentFiles(cfg.contentRoot)
    const wanted = flags.post
    const wantedAbs = resolve(wanted)
    const match = all.find((f) =>
      f.slug === wanted ||
      f.path === wantedAbs ||
      f.path.endsWith(`/${wanted}/index.md`)
    )
    if (!match) throw new Error(`--post: kein ContentFile für "${wanted}" gefunden`)
    return [match]
  }

  const NULL_SHA = '0'.repeat(40)
  const envBefore = Deno.env.get('GITHUB_EVENT_BEFORE')
  const from = envBefore && envBefore !== '' ? envBefore : 'HEAD~1'

  if (from === NULL_SHA || from === '') {
    console.log(
      'diff-Modus: GITHUB_EVENT_BEFORE ist null-SHA oder leer (z. B. erster ' +
        'Push auf Branch oder workflow_dispatch ohne push-Kontext). Kein Diff ' +
        'verfügbar — leerer Lauf. Für vollen Re-Sync: --force-all.',
    )
    return []
  }

  return await changedContentFiles({
    from,
    to: 'HEAD',
    contentRoot: cfg.contentRoot,
  })
}

function statusEmoji(s: PostStatus): string {
  switch (s) {
    case 'ok':
      return '✅'
    case 'skipped-empty-frontmatter':
    case 'skipped-missing-fields':
      return '⏭️ '
    default:
      return '❌'
  }
}

export async function runPublish(args: string[]): Promise<number> {
  const flags = parseArgs(args, {
    boolean: ['dry-run', 'force-all'],
    string: ['post'],
  }) as PublishFlags

  const dryRun = flags['dry-run'] === true
  const cfg = loadConfig()
  const mode = flags['force-all'] ? 'force-all' : flags.post ? `single (${flags.post})` : 'diff'
  const logger = createLogger({ mode, contentRoot: cfg.contentRoot })

  console.log('=== publish ===')
  console.log(`mode:       ${mode}`)
  console.log(`dry-run:    ${dryRun}`)
  console.log(`contentRoot:${cfg.contentRoot}`)

  let files: ContentFile[]
  try {
    files = await selectFiles(cfg, flags)
  } catch (err) {
    console.error(`Auswahl fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`)
    return 1
  }

  console.log(`files:      ${files.length}\n`)

  let signer: Signer | null = null
  if (!dryRun && files.length > 0) {
    console.log('Bunker connect…')
    signer = await createBunkerSigner(cfg.bunkerUrl, {
      clientSecretHex: cfg.clientSecretHex,
    })
    const got = await signer.getPublicKey()
    if (got !== cfg.authorPubkeyHex) {
      console.error(`Bunker-Pubkey-Mismatch: got=${got} expected=${cfg.authorPubkeyHex}`)
      return 1
    }
    console.log(`Bunker ok (${got.slice(0, 8)}…)\n`)
  }

  const results: PostResult[] = []
  for (const file of files) {
    const r = await processPost(file, { cfg, dryRun, signer })
    results.push(r)
    logger.record(r)
    console.log(`${statusEmoji(r.status)} ${r.file.lang}/${r.file.slug}`)
    if (r.reason) console.log(`   ${r.reason}`)
    if (r.articleAcks && !dryRun) {
      const ok = countOkAcks(r.articleAcks)
      console.log(
        `   30023: ${ok}/${r.articleAcks.length} acks${
          r.articleEventId ? `, id=${r.articleEventId.slice(0, 12)}…` : ''
        }`,
      )
    }
    if (r.ambAcks && !dryRun) {
      const ok = countOkAcks(r.ambAcks)
      console.log(
        `   30142: ${ok}/${r.ambAcks.length} acks${
          r.ambEventId ? `, id=${r.ambEventId.slice(0, 12)}…` : ''
        }`,
      )
    }
    if (r.bilder) {
      const b = r.bilder
      const teile = [
        b.hochgeladen.length ? `${b.hochgeladen.length} Blob(s) ${dryRun ? 'würden hochgeladen' : 'hochgeladen'}` : '',
        b.nachweise.length ? `${b.nachweise.length} Nachweis(e) ${dryRun ? 'würden geprägt' : 'geprägt'}` : '',
        b.unveraendert.length ? `${b.unveraendert.length} unverändert` : '',
      ].filter(Boolean)
      if (teile.length) console.log(`   bilder: ${teile.join(', ')}`)
      for (const w of b.warnungen) console.log(`   ⚠️  ${w}`)
    }
    if (r.status === 'ok' && !dryRun && r.articleEventId) {
      const dTag = (await readDTag(file.path)) ?? ''
      const naddr = nip19.naddrEncode({
        identifier: dTag,
        pubkey: cfg.authorPubkeyHex,
        kind: 30023,
        relays: [ARTICLE_HINT_RELAY],
      })
      console.log(`   naddr: ${naddr}`)
    }
  }

  const counts = {
    ok: results.filter((r) => r.status === 'ok').length,
    skipped: results.filter((r) => r.status.startsWith('skipped')).length,
    failed: results.filter((r) => r.status.startsWith('failed')).length,
  }
  console.log(`\nSummary: ok=${counts.ok}  skipped=${counts.skipped}  failed=${counts.failed}`)

  if (isSilentNoop(results)) {
    console.log(
      `\n⚠️  ${results.length} Datei(en) geändert, aber nichts publiziert — ` +
        `die Änderung ist NICHT auf den Relays angekommen.`,
    )
  }

  const incomplete = results.filter(
    (r) => r.status === 'ok' && (r.missingRecommended?.length ?? 0) > 0,
  )
  if (incomplete.length > 0) {
    console.log(
      `💡 ${incomplete.length} publizierte(r) Post(s) mit unvollständigen Metadaten ` +
        `(fehlende empfohlene Felder).`,
    )
  }

  try {
    await writeStepSummary(renderSummary({ mode, dryRun, results }))
  } catch (err) {
    console.error(
      `Job-Summary konnte nicht geschrieben werden: ${
        err instanceof Error ? err.message : String(err)
      }`,
    )
  }

  const exitCode = counts.failed > 0 ? 1 : 0
  try {
    const logFile = await logger.finish(exitCode)
    console.log(`Log:     ${logFile}`)
  } catch (err) {
    console.error(
      `Log konnte nicht geschrieben werden: ${err instanceof Error ? err.message : String(err)}`,
    )
  }

  return exitCode
}

async function readDTag(path: string): Promise<string | undefined> {
  try {
    const md = await Deno.readTextFile(path)
    const parsed = parseMarkdown(md)
    if (!parsed?.metadata.id) return undefined
    return new URL(parsed.metadata.id).pathname.replace(/^\//, '').replace(/\/$/, '')
  } catch {
    return undefined
  }
}

if (import.meta.main) {
  const code = await runPublish(Deno.args)
  Deno.exit(code)
}
