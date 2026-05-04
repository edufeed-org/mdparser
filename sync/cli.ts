import { runCheck } from './subcommands/check.ts'
import { runPublish } from './subcommands/publish.ts'
import { runValidatePost } from './subcommands/validate-post.ts'

function usage(): never {
  console.error('Usage: cli.ts <subcommand> [args…]')
  console.error('Subcommands:')
  console.error('  check                              — Pre-Flight: Bunker + Relays')
  console.error('  publish [--force-all|--post <s>] [--dry-run]')
  console.error('  validate-post <path>               — lokal validieren')
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
    default:
      usage()
  }
}

const code = await main()
Deno.exit(code)
