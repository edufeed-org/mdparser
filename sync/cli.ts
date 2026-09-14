import { runCheck } from './subcommands/check.ts'
import { runPublish } from './subcommands/publish.ts'
import { runValidatePost } from './subcommands/validate-post.ts'
import { runRedaktion } from './subcommands/redaktion.ts'
import { runNavigation } from './subcommands/navigation.ts'

function usage(): never {
  console.error('Usage: cli.ts <subcommand> [args…]')
  console.error('Subcommands:')
  console.error('  check                              — Pre-Flight: Bunker + Relays')
  console.error('  publish [--force-all|--post <s>] [--dry-run]')
  console.error('  validate-post <path>               — lokal validieren')
  console.error('  redaktion [--dry-run]              — Redaktionsliste (kind:30000 d=redaktion) publizieren')
  console.error('  navigation [--dry-run]             — Menü und Fußzeile (kind:30004) aus Website/navigation.yaml publizieren')
  Deno.exit(2)
}

async function main(): Promise<number> {
  const [sub, ...rest] = Deno.args
  switch (sub) {
    case 'check':
      return await runCheck()
    case 'publish':
      return await runPublish(rest)
    case 'validate-post':
      return await runValidatePost(rest)
    case 'redaktion':
      return await runRedaktion(rest)
    case 'navigation':
      return await runNavigation(rest)
    default:
      usage()
  }
}

const code = await main()
Deno.exit(code)
