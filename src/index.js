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

// Für parse() Funktion
import { parseMarkdownFile as _parseMarkdownFile, parseMarkdownString as _parseMarkdownString } from './parser.js'

/**
 * Convenience-Funktion: Parst Markdown von verschiedenen Quellen
 * @param {string} source - Dateipfad, URL oder Markdown-String
 * @param {Object} options - Parser-Optionen
 * @returns {Promise<Object>} Parsed result
 */
export async function parse(source, options = {}) {
  // Prüfe ob es ein Dateipfad ist
  if (source.startsWith('/') || source.startsWith('./') || source.startsWith('../')) {
    return _parseMarkdownFile(source, options)
  }
  
  // Prüfe ob es eine URL ist
  if (source.startsWith('http://') || source.startsWith('https://')) {
    const response = await fetch(source)
    const markdown = await response.text()
    return _parseMarkdownString(markdown, options)
  }
  
  // Ansonsten als Markdown-String behandeln
  return _parseMarkdownString(source, options)
}
