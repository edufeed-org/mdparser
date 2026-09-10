import { assert, assertEquals } from 'jsr:@std/assert@^1.0.0'
import {
  bilderSchritt,
  bildUrls,
  eintragFuer,
  nachweisEvent,
  nachweisGleich,
  type BilderDeps,
} from './bilder.ts'
import type { CommonMetadata } from './parser.ts'

const H1 = 'a'.repeat(64)
const H2 = 'c'.repeat(64)
const U1 = `https://blossom.edufeed.org/${H1}.jpeg`
const U2 = `https://blossom.edufeed.org/${H2}.png`
const PK = 'b'.repeat(64)

function meta(over: Partial<CommonMetadata> = {}): CommonMetadata {
  return { id: 'https://oer.community/t', name: 'T', description: 'D', inLanguage: ['de'], ...over }
}

// --- Welche Bilder braucht der Beitrag? ---

Deno.test('bildUrls: Cover zuerst, Fließtext danach, ohne Dubletten, ohne Nicht-Hash-URLs', () => {
  const content = `Text ![a](${U2}) ![b](${U1}) ![c](lokal.jpg) ![d](https://example.org/x.png)`
  assertEquals(bildUrls(meta({ image: U1 }), content), [
    { hash: H1, url: U1 },
    { hash: H2, url: U2 },
  ])
})

Deno.test('bildUrls: ohne Hash-URLs leer', () => {
  assertEquals(bildUrls(meta({ image: 'https://oer.community/t/bild.jpg' }), '![x](bild.jpg)'), [])
})

// --- Eintrag im # bilder-Block finden ---

Deno.test('eintragFuer: Dateiname, Hash-URL oder URL mit gleichem Hash', () => {
  const bilder = {
    'bild.jpeg': { licenceUrl: 'https://l/1' },
    [U2]: { licenceUrl: 'https://l/2' },
  }
  assertEquals(eintragFuer(bilder, H1, U1, 'bild.jpeg')?.licenceUrl, 'https://l/1')
  assertEquals(eintragFuer(bilder, H2, U2)?.licenceUrl, 'https://l/2')
  assertEquals(eintragFuer(bilder, H2, `https://andere.host/${H2}.png`)?.licenceUrl, 'https://l/2')
  assertEquals(eintragFuer(bilder, 'f'.repeat(64), 'https://x/y'), undefined)
})

// --- kind:1063 aus dem Block, Tag-Form wie md2blossom und foerbico-editor ---

Deno.test('nachweisEvent: Abbildung der Konventionsnamen auf 1063-Tags', () => {
  const ev = nachweisEvent({
    url: U1, hash: H1, mime: 'image/jpeg', groesse: 123, pubkey: PK,
    eintrag: {
      alt: 'Alt', title: 'Titel', author: 'FOERBICO', authorUrl: 'https://oer.community',
      licenceUrl: 'https://creativecommons.org/licenses/by/4.0/', sourceUrl: 'https://oer.community/t',
      modification: 'beschnitten', pubkey: 'd'.repeat(64),
    },
  })
  assertEquals(ev.kind, 1063)
  assertEquals(ev.content, '')
  assertEquals(ev.tags, [
    ['url', U1], ['x', H1], ['m', 'image/jpeg'], ['size', '123'],
    ['title', 'Titel'], ['license', 'https://creativecommons.org/licenses/by/4.0/'],
    ['credit', 'FOERBICO'], ['alt', 'Alt'],
    ['source', 'https://oer.community/t'], ['authorUrl', 'https://oer.community'],
    ['modification', 'beschnitten'], ['p', 'd'.repeat(64)],
  ])
})

Deno.test('nachweisEvent: ohne Datei entfallen m und size, alt fällt auf title zurück', () => {
  const ev = nachweisEvent({ url: U1, hash: H1, pubkey: PK, eintrag: { title: 'T', licenceUrl: 'https://l' } })
  assertEquals(ev.tags.find((t) => t[0] === 'm'), undefined)
  assertEquals(ev.tags.find((t) => t[0] === 'size'), undefined)
  assertEquals(ev.tags.find((t) => t[0] === 'alt')?.[1], 'T')
})

Deno.test('nachweisGleich: nur die Tags zählen', () => {
  const a = nachweisEvent({ url: U1, hash: H1, pubkey: PK, eintrag: { alt: 'x', licenceUrl: 'https://l' } })
  const b = { ...a, created_at: a.created_at + 100, id: 'e', sig: 's' }
  assert(nachweisGleich(a, b))
  const c = nachweisEvent({ url: U1, hash: H1, pubkey: PK, eintrag: { alt: 'y', licenceUrl: 'https://l' } })
  assert(!nachweisGleich(a, c))
})

// --- Der Schritt als Ganzes, mit ausgetauschter Außenwelt ---

interface Welt {
  blobs: Set<string>
  nachweise: Record<string, ReturnType<typeof nachweisEvent> | null>
  hochgeladen: string[]
  publiziert: string[]
  signiert: number[]
}

function welt(over: Partial<Welt> = {}): { w: Welt; deps: BilderDeps } {
  const w: Welt = { blobs: new Set(), nachweise: {}, hochgeladen: [], publiziert: [], signiert: [], ...over }
  const deps: BilderDeps = {
    pubkey: PK,
    dryRun: false,
    signer: {
      getPublicKey: () => Promise.resolve(PK),
      signEvent: (ev) => {
        w.signiert.push(ev.kind)
        return Promise.resolve({ ...ev, id: 'id-' + ev.kind, sig: 'sig' })
      },
    },
    blobVorhanden: (hash) => Promise.resolve(w.blobs.has(hash)),
    hochladen: (datei) => {
      w.hochgeladen.push(datei.hash)
      w.blobs.add(datei.hash)
      return Promise.resolve()
    },
    letzterNachweis: (hash) => Promise.resolve(w.nachweise[hash] ?? null),
    publizieren: (ev) => {
      w.publiziert.push(ev.tags.find((t) => t[0] === 'x')![1])
      return Promise.resolve(1)
    },
  }
  return { w, deps }
}

const DATEIEN = new Map([[H1, { datei: 'bild.jpeg', hash: H1, mime: 'image/jpeg', groesse: 3, bytes: new Uint8Array(3) }]])
const BLOCK = { 'bild.jpeg': { alt: 'A', author: 'FOERBICO', licenceUrl: 'https://creativecommons.org/licenses/by/4.0/' } }

Deno.test('bilderSchritt: Blob fehlt, Datei da → hochladen; kein Nachweis → prägen', async () => {
  const { w, deps } = welt()
  const r = await bilderSchritt({ metadata: meta({ image: U1 }), content: '', bilder: BLOCK }, DATEIEN, deps)
  assertEquals(w.hochgeladen, [H1])
  assertEquals(w.publiziert, [H1])
  assertEquals(w.signiert, [24242, 1063].filter((k) => k !== 24242)) // Upload signiert im hochladen-Stub, hier nur das 1063
  assertEquals(r.hochgeladen, [H1])
  assertEquals(r.nachweise, [H1])
  assertEquals(r.warnungen, [])
})

Deno.test('bilderSchritt: alles da und Nachweis unverändert → nichts zu tun', async () => {
  const bestehend = nachweisEvent({
    url: U1, hash: H1, mime: 'image/jpeg', groesse: 3, pubkey: PK, eintrag: BLOCK['bild.jpeg'],
  })
  const { w, deps } = welt({ blobs: new Set([H1]), nachweise: { [H1]: bestehend } })
  const r = await bilderSchritt({ metadata: meta({ image: U1 }), content: '', bilder: BLOCK }, DATEIEN, deps)
  assertEquals(w.hochgeladen, [])
  assertEquals(w.publiziert, [])
  assertEquals(r.unveraendert, [H1])
})

Deno.test('bilderSchritt: geänderter Block → neuer Nachweis, alter bleibt liegen', async () => {
  const alt = nachweisEvent({ url: U1, hash: H1, mime: 'image/jpeg', groesse: 3, pubkey: PK, eintrag: { alt: 'alt', licenceUrl: 'https://l' } })
  const { w, deps } = welt({ blobs: new Set([H1]), nachweise: { [H1]: alt } })
  const r = await bilderSchritt({ metadata: meta({ image: U1 }), content: '', bilder: BLOCK }, DATEIEN, deps)
  assertEquals(w.publiziert, [H1])
  assertEquals(r.nachweise, [H1])
})

Deno.test('bilderSchritt: Blob fehlt ohne lokale Datei → Warnung, kein Abbruch', async () => {
  const { w, deps } = welt()
  const r = await bilderSchritt({ metadata: meta({ image: U2 }), content: '', bilder: {} }, DATEIEN, deps)
  assertEquals(w.hochgeladen, [])
  assert(r.warnungen.some((x) => x.includes(H2.slice(0, 8)) && x.includes('Blossom')))
  assert(r.warnungen.some((x) => x.includes('# bilder')))
})

Deno.test('bilderSchritt: Eintrag ohne licenceUrl → Warnung statt Nachweis', async () => {
  const { w, deps } = welt({ blobs: new Set([H1]) })
  const r = await bilderSchritt(
    { metadata: meta({ image: U1 }), content: '', bilder: { 'bild.jpeg': { alt: 'A' } } },
    DATEIEN,
    deps,
  )
  assertEquals(w.publiziert, [])
  assert(r.warnungen.some((x) => x.includes('licenceUrl')))
})

Deno.test('bilderSchritt: dry-run meldet, was passieren würde, und rührt nichts an', async () => {
  const { w, deps } = welt()
  const r = await bilderSchritt({ metadata: meta({ image: U1 }), content: '', bilder: BLOCK }, DATEIEN, { ...deps, dryRun: true, signer: null })
  assertEquals(w.hochgeladen, [])
  assertEquals(w.publiziert, [])
  assertEquals(r.hochgeladen, [H1])
  assertEquals(r.nachweise, [H1])
})

Deno.test('bilderSchritt: Fehler beim Upload wird Warnung, der Nachweis kommt trotzdem', async () => {
  const { w, deps } = welt()
  deps.hochladen = () => Promise.reject(new Error('HTTP 413'))
  const r = await bilderSchritt({ metadata: meta({ image: U1 }), content: '', bilder: BLOCK }, DATEIEN, deps)
  assert(r.warnungen.some((x) => x.includes('HTTP 413')))
  assertEquals(w.publiziert, [H1])
})

Deno.test('bilderSchritt: ohne Hash-URLs passiert nichts', async () => {
  const { deps } = welt()
  const r = await bilderSchritt({ metadata: meta(), content: '![x](lokal.jpg)' }, new Map(), deps)
  assertEquals(r, { hochgeladen: [], nachweise: [], unveraendert: [], warnungen: [] })
})

// --- KI-Kennzeichnung (edufeed-Wiki license-events-nope, 2026-09-10): ai = generated | modified ---

Deno.test('nachweisEvent: ai → ai-Tag als letzter Tag, nur generated oder modified', () => {
  const gen = nachweisEvent({ url: U1, hash: H1, pubkey: PK, eintrag: { licenceUrl: 'https://l', ai: 'generated', pubkey: 'd'.repeat(64) } })
  assertEquals(gen.tags.at(-1), ['ai', 'generated'])
  const mod = nachweisEvent({ url: U1, hash: H1, pubkey: PK, eintrag: { licenceUrl: 'https://l', ai: 'modified' } })
  assertEquals(mod.tags.at(-1), ['ai', 'modified'])
  const ohne = nachweisEvent({ url: U1, hash: H1, pubkey: PK, eintrag: { licenceUrl: 'https://l' } })
  assertEquals(ohne.tags.find((t) => t[0] === 'ai'), undefined)
  // Fremder Wert: kein Tag — Leser würden ihn ohnehin ignorieren
  const falsch = nachweisEvent({ url: U1, hash: H1, pubkey: PK, eintrag: { licenceUrl: 'https://l', ai: 'ja' as never } })
  assertEquals(falsch.tags.find((t) => t[0] === 'ai'), undefined)
})

Deno.test('bilderSchritt: ungültiger ai-Wert → Warnung, Nachweis kommt trotzdem ohne ai-Tag', async () => {
  const { w, deps } = welt({ blobs: new Set([H1]) })
  const block = { 'bild.jpeg': { ...BLOCK['bild.jpeg'], ai: 'KI' as never } }
  const r = await bilderSchritt({ metadata: meta({ image: U1 }), content: '', bilder: block }, DATEIEN, deps)
  assertEquals(r.nachweise, [H1])
  assertEquals(w.publiziert, [H1])
  assertEquals(r.warnungen.length, 1)
  assert(r.warnungen[0].includes('ai') && r.warnungen[0].includes('generated'))
})

Deno.test('bilderSchritt: ai ergänzt → bestehender Nachweis gilt als geändert, neuer wird geprägt', async () => {
  const alt = nachweisEvent({ url: U1, hash: H1, pubkey: PK, eintrag: BLOCK['bild.jpeg'], mime: 'image/jpeg', groesse: 3 })
  const { w, deps } = welt({ blobs: new Set([H1]), nachweise: { [H1]: alt } })
  const block = { 'bild.jpeg': { ...BLOCK['bild.jpeg'], ai: 'generated' as const } }
  const r = await bilderSchritt({ metadata: meta({ image: U1 }), content: '', bilder: block }, DATEIEN, deps)
  assertEquals(r.nachweise, [H1])
  assertEquals(w.publiziert, [H1])
})
