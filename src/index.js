/**
 * MDParser - Main Entry Point
 * Markdown to JSON Parser für AMB-konforme Inhalte
 */

// Parser
export {
  parseMarkdownFile,
  parseMarkdownString,
  astToMarkdown,
  createMarkdownProcessor,
  extractHeadings,
  extractLinks,
  extractImages
} from './parser.js'

// YAML Extractor
export {
  extractYAML,
  removeYAML,
  hasYAML
} from './extractors/yaml-extractor.js'

// AMB Metadata Extractor
export {
  extractAMBMetadata,
  validateAMBMetadata
} from './extractors/amb-extractor.js'

// Forgejo Client
export {
  ForgejoClient,
  createForgejoClient
} from './forgejo-client.js'

/**
 * Convenience-Funktion: Parst Markdown von verschiedenen Quellen
 * @param {string} source - Dateipfad, URL oder Markdown-String
 * @param {Object} options - Parser-Optionen
 * @returns {Promise<Object>} Parsed result
 */
export async function parse(source, options = {}) {
  const { parseMarkdownFile, parseMarkdownString } = await import('./parser.js')
  
  // Prüfe ob es ein Dateipfad ist
  if (source.startsWith('/') || source.startsWith('./') || source.startsWith('../')) {
    return parseMarkdownFile(source, options)
  }
  
  // Prüfe ob es eine URL ist
  if (source.startsWith('http://') || source.startsWith('https://')) {
    const response = await fetch(source)
    const markdown = await response.text()
    return parseMarkdownString(markdown, options)
  }
  
  // Ansonsten als Markdown-String behandeln
  return parseMarkdownString(source, options)
}

// Default Export
export default {
  parse,
  parseMarkdownFile,
  parseMarkdownString,
  ForgejoClient,
  createForgejoClient,
  extractYAML,
  extractAMBMetadata
}
