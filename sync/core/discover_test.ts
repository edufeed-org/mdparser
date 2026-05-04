import { assertEquals } from 'jsr:@std/assert@^1.0.0'
import { join } from 'jsr:@std/path@^1.0.0'
import { allContentFiles, type ContentFile } from './discover.ts'

async function buildFixture(): Promise<string> {
  const root = await Deno.makeTempDir({ prefix: 'mdparser-discover-' })

  const files: string[] = [
    'de/posts/2024-08-05-hello/index.md',
    'de/posts/2024-08-05-hello/cover.jpg',
    'de/posts/2026-03-02-foerbico/index.md',
    'de/posts/no-index/cover.png',
    'de/impressum/index.md',
    'de/oer-und-oep/index.md',
    'de/oer-und-oep/lernmodul/index.md',
    'de/_drafts/secret/index.md',
    'en/posts/2024-08-05-hello/index.md',
    'en/about/index.md',
    'README.md',
  ]

  for (const rel of files) {
    const abs = join(root, rel)
    await Deno.mkdir(join(abs, '..'), { recursive: true })
    await Deno.writeTextFile(abs, '')
  }

  return root
}

function pick(files: ContentFile[], slug: string, lang: string): ContentFile | undefined {
  return files.find((f) => f.slug === slug && f.lang === lang)
}

Deno.test('allContentFiles — Posts und Pages werden klassifiziert', async () => {
  const root = await buildFixture()
  try {
    const files = await allContentFiles(root)

    const slugs = files.map((f) => `${f.lang}/${f.type}:${f.slug}`).sort()
    assertEquals(slugs, [
      'de/page:impressum',
      'de/page:oer-und-oep',
      'de/page:oer-und-oep/lernmodul',
      'de/post:2024-08-05-hello',
      'de/post:2026-03-02-foerbico',
      'en/page:about',
      'en/post:2024-08-05-hello',
    ])
  } finally {
    await Deno.remove(root, { recursive: true })
  }
})

Deno.test('allContentFiles — Posts ohne index.md werden ignoriert', async () => {
  const root = await buildFixture()
  try {
    const files = await allContentFiles(root)
    assertEquals(pick(files, 'no-index', 'de'), undefined)
  } finally {
    await Deno.remove(root, { recursive: true })
  }
})

Deno.test('allContentFiles — _drafts wird übersprungen', async () => {
  const root = await buildFixture()
  try {
    const files = await allContentFiles(root)
    const draft = files.find((f) => f.slug.includes('secret'))
    assertEquals(draft, undefined)
  } finally {
    await Deno.remove(root, { recursive: true })
  }
})

Deno.test('allContentFiles — geschachtelte Pages mit Pfad-slug', async () => {
  const root = await buildFixture()
  try {
    const files = await allContentFiles(root)
    const page = pick(files, 'oer-und-oep/lernmodul', 'de')
    assertEquals(page?.type, 'page')
    assertEquals(page?.path, join(root, 'de/oer-und-oep/lernmodul/index.md'))
  } finally {
    await Deno.remove(root, { recursive: true })
  }
})

Deno.test('allContentFiles — nur 2-Buchstaben-Sprachordner', async () => {
  const root = await Deno.makeTempDir({ prefix: 'mdparser-discover-langs-' })
  try {
    await Deno.mkdir(join(root, 'de/posts/x'), { recursive: true })
    await Deno.writeTextFile(join(root, 'de/posts/x/index.md'), '')
    await Deno.mkdir(join(root, 'deu/posts/x'), { recursive: true })
    await Deno.writeTextFile(join(root, 'deu/posts/x/index.md'), '')
    await Deno.mkdir(join(root, 'assets'), { recursive: true })
    await Deno.writeTextFile(join(root, 'assets/index.md'), '')

    const files = await allContentFiles(root)
    assertEquals(files.length, 1)
    assertEquals(files[0].lang, 'de')
  } finally {
    await Deno.remove(root, { recursive: true })
  }
})
