import { parseArgs } from 'jsr:@std/cli@^1.0.6/parse-args'
import { nip19 } from 'nostr-tools'
import { parseMarkdown, validateRequired } from './parser.ts'
import { buildArticleEvent } from './events/article.ts'
import { buildAmbEvent } from './events/amb.ts'
import { createBunkerSigner } from './signer.ts'
import { publishEvent } from './relay.ts'

const CONTENT_RELAY = 'wss://relay-rpi.edufeed.org/'
const AMB_RELAY = 'wss://amb-relay.edufeed.org/'

interface CliArgs {
  'dry-run'?: boolean
  _: (string | number)[]
}

function usage(): never {
  console.error('Usage: publish-single.ts [--dry-run] <path/to/index.md>')
  Deno.exit(2)
}

async function main() {
  const args = parseArgs(Deno.args, {
    boolean: ['dry-run'],
  }) as CliArgs

  const path = args._[0]
  if (typeof path !== 'string' || path.length === 0) usage()

  const dryRun = args['dry-run'] === true

  // Markdown lesen
  let markdown: string
  try {
    markdown = await Deno.readTextFile(path)
  } catch (err) {
    console.error(`Datei nicht lesbar: ${path}`)
    console.error(err instanceof Error ? err.message : String(err))
    Deno.exit(1)
  }

  const parsed = parseMarkdown(markdown)
  if (!parsed) {
    console.error('Kein YAML-Frontmatter gefunden.')
    Deno.exit(1)
  }

  const errors = validateRequired(parsed.metadata)
  if (errors.length > 0) {
    console.error('Pflichtfeld-Fehler:')
    for (const e of errors) console.error(`  - ${e}`)
    Deno.exit(1)
  }

  // Pubkey: bei dry-run reicht ein Platzhalter, bei live kommt er aus Bunker
  const fallbackPubkey = Deno.env.get('AUTHOR_PUBKEY_HEX') ??
    '5a12b41ec15b466321e88c371be2dc47d9193f9c8bba4ab09fc50045bd35aedf'

  if (dryRun) {
    console.log('=== DRY RUN ===')
    console.log(`Datei: ${path}`)
    console.log(`Pubkey (placeholder): ${fallbackPubkey}\n`)

    const article = buildArticleEvent(parsed.metadata, parsed.content, fallbackPubkey, AMB_RELAY)
    const amb = parsed.metadata.type === 'LearningResource'
      ? buildAmbEvent(parsed.metadata, fallbackPubkey, CONTENT_RELAY)
      : null

    console.log('--- Kind 30023 (Content, Long-form) ---')
    console.log(JSON.stringify(article, null, 2))

    if (amb) {
      console.log('\n--- Kind 30142 (AMB-Metadaten) ---')
      console.log(JSON.stringify(amb, null, 2))
    } else {
      console.log('\n(kein 30142 — type ist nicht LearningResource)')
    }

    const dTag = article.tags.find((t) => t[0] === 'd')?.[1] ?? ''
    const naddrPreview = nip19.naddrEncode({
      identifier: dTag,
      pubkey: fallbackPubkey,
      kind: 30023,
      relays: [CONTENT_RELAY],
    })
    console.log(`\nVoraussichtliche naddr (mit fallback-pubkey): ${naddrPreview}`)
    return
  }

  // Live-Modus
  const bunkerUrl = Deno.env.get('BUNKER_URL')
  if (!bunkerUrl) {
    console.error('BUNKER_URL fehlt in .env')
    Deno.exit(1)
  }

  console.log('=== LIVE PUBLISH ===')
  console.log(`Datei: ${path}`)

  const clientSecretHex = Deno.env.get('CLIENT_SECRET_HEX') ?? undefined
  console.log('\nBunker connect…')
  const signer = await createBunkerSigner(bunkerUrl, { clientSecretHex })
  const pubkey = await signer.getPublicKey()
  console.log(`Bunker-Pubkey: ${pubkey}\n`)

  const article = buildArticleEvent(parsed.metadata, parsed.content, pubkey, AMB_RELAY)
  const amb = parsed.metadata.type === 'LearningResource'
    ? buildAmbEvent(parsed.metadata, pubkey, CONTENT_RELAY)
    : null

  console.log('Signiere Kind 30023…')
  const signedArticle = await signer.signEvent(article)
  console.log(`  id=${signedArticle.id.slice(0, 16)}…`)

  let signedAmb = null
  if (amb) {
    console.log('Signiere Kind 30142…')
    signedAmb = await signer.signEvent(amb)
    console.log(`  id=${signedAmb.id.slice(0, 16)}…`)
  }

  console.log(`\nPublish 30023 → ${CONTENT_RELAY}`)
  const r1 = await publishEvent(CONTENT_RELAY, signedArticle)
  console.log(`  ${r1.ok ? '✅' : '❌'} ${r1.message ?? ''}`)

  if (signedAmb) {
    console.log(`Publish 30142 → ${AMB_RELAY}`)
    const r2 = await publishEvent(AMB_RELAY, signedAmb)
    console.log(`  ${r2.ok ? '✅' : '❌'} ${r2.message ?? ''}`)
  }

  const dTag = signedArticle.tags.find((t) => t[0] === 'd')?.[1] ?? ''
  const naddr = nip19.naddrEncode({
    identifier: dTag,
    pubkey,
    kind: 30023,
    relays: [CONTENT_RELAY],
  })
  console.log(`\n=== Adresse für Kommentare ===`)
  console.log(`naddr: ${naddr}`)
  console.log(`Habla:    https://habla.news/a/${naddr}`)
  console.log(`Yakihonne: https://yakihonne.com/article/${naddr}`)

  Deno.exit(0)
}

await main()
