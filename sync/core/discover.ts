import { walk } from 'jsr:@std/fs@^1.0.0/walk'
import { dirname, join, relative } from 'jsr:@std/path@^1.0.0'

export interface ContentFile {
  path: string
  type: 'post' | 'page'
  lang: string
  slug: string
}

const LANG_DIR = /^[a-z]{2}$/

async function exists(path: string): Promise<boolean> {
  try {
    await Deno.stat(path)
    return true
  } catch {
    return false
  }
}

async function listLangs(contentRoot: string): Promise<string[]> {
  const langs: string[] = []
  for await (const entry of Deno.readDir(contentRoot)) {
    if (entry.isDirectory && LANG_DIR.test(entry.name)) langs.push(entry.name)
  }
  langs.sort()
  return langs
}

async function listPosts(langRoot: string, lang: string): Promise<ContentFile[]> {
  const postsRoot = join(langRoot, 'posts')
  if (!(await exists(postsRoot))) return []

  const out: ContentFile[] = []
  for await (const entry of Deno.readDir(postsRoot)) {
    if (!entry.isDirectory) continue
    const indexPath = join(postsRoot, entry.name, 'index.md')
    if (!(await exists(indexPath))) continue
    out.push({ path: indexPath, type: 'post', lang, slug: entry.name })
  }
  return out
}

async function listPages(langRoot: string, lang: string): Promise<ContentFile[]> {
  const out: ContentFile[] = []
  for await (
    const entry of walk(langRoot, {
      includeFiles: true,
      includeDirs: false,
      match: [/\/index\.md$/],
    })
  ) {
    const dir = dirname(entry.path)
    const rel = relative(langRoot, dir)
    if (rel === '' || rel === '.') continue
    const segments = rel.split('/')
    if (segments[0] === 'posts') continue
    if (segments.some((s) => s.startsWith('_'))) continue
    out.push({ path: entry.path, type: 'page', lang, slug: rel })
  }
  return out
}

export async function allContentFiles(contentRoot: string): Promise<ContentFile[]> {
  const langs = await listLangs(contentRoot)
  const out: ContentFile[] = []
  for (const lang of langs) {
    const langRoot = join(contentRoot, lang)
    const posts = await listPosts(langRoot, lang)
    const pages = await listPages(langRoot, lang)
    out.push(...posts, ...pages)
  }
  out.sort((a, b) => a.path.localeCompare(b.path))
  return out
}
