import { parseMarkdown } from '../core/parser.ts'
import { validatePost } from '../core/validation.ts'

function usage(): never {
  console.error('Usage: validate-post <path/to/index.md>')
  Deno.exit(2)
}

export async function runValidatePost(args: string[]): Promise<number> {
  const path = args[0]
  if (typeof path !== 'string' || path.length === 0) usage()

  let markdown: string
  try {
    markdown = await Deno.readTextFile(path)
  } catch (err) {
    console.error(`Datei nicht lesbar: ${path}`)
    console.error(err instanceof Error ? err.message : String(err))
    return 2
  }

  const parsed = parseMarkdown(markdown)
  const result = validatePost(parsed)

  console.log(`Datei:   ${path}`)
  console.log(`Status:  ${result.status}`)
  if (result.reason) console.log(`Grund:   ${result.reason}`)
  if (result.missing.length > 0) {
    console.log(`Fehlend: ${result.missing.join(', ')}`)
  }

  return result.status === 'ok' ? 0 : 1
}

if (import.meta.main) {
  const code = await runValidatePost(Deno.args)
  Deno.exit(code)
}
