/**
 * Core Markdown Parser
 * Nutzt unified/remark für Markdown-Parsing mit YAML Front Matter
 */

import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkFrontmatter from 'remark-frontmatter'
import remarkGfm from 'remark-gfm'
import remarkStringify from 'remark-stringify'
import { readFile } from 'fs/promises'
import { extractYAML, removeYAML } from './extractors/yaml-extractor.js'
import { extractAMBMetadata } from './extractors/amb-extractor.js'

/**
 * Parst eine Markdown-Datei mit YAML Front Matter
 * @param {string} filePath - Pfad zur Markdown-Datei
 * @param {Object} options - Optionale Konfiguration
 * @param {boolean} options.extractYaml - YAML extrahieren (default: true)
 * @param {boolean} options.parseGfm - GitHub Flavored Markdown (default: true)
 * @param {boolean} options.extractAMB - AMB-Metadaten extrahieren (default: true)
 * @returns {Promise<Object>} Parsed result
 */
export async function parseMarkdownFile(filePath, options = {}) {
  const {
    extractYaml = true,
    parseGfm = true,
    extractAMB = true
  } = options

  try {
    // Datei einlesen
    const markdownContent = await readFile(filePath, 'utf-8')
    
    // Markdown parsen
    return await parseMarkdownString(markdownContent, {
      extractYaml,
      parseGfm,
      extractAMB
    })
  } catch (error) {
    throw new Error(`Failed to parse Markdown file: ${error.message}`)
  }
}

/**
 * Parst einen Markdown-String mit YAML Front Matter
 * @param {string} markdownContent - Markdown-Content als String
 * @param {Object} options - Optionale Konfiguration
 * @returns {Promise<Object>} Parsed result
 */
export async function parseMarkdownString(markdownContent, options = {}) {
  const {
    extractYaml = true,
    parseGfm = true,
    extractAMB = true
  } = options

  const result = {
    raw: markdownContent,
    yaml: null,
    metadata: null,
    ast: null,
    content: null
  }

  try {
    // YAML Front Matter extrahieren
    if (extractYaml) {
      result.yaml = extractYAML(markdownContent)
      
      // AMB-Metadaten extrahieren
      if (extractAMB && result.yaml) {
        result.metadata = extractAMBMetadata(result.yaml)
      }
    }

    // Content ohne YAML
    const contentWithoutYAML = removeYAML(markdownContent)
    result.content = contentWithoutYAML

    // unified Pipeline aufbauen
    const processor = unified()
      .use(remarkParse) // Markdown → AST
      .use(remarkFrontmatter, ['yaml']) // YAML Front Matter Support

    // Optional: GitHub Flavored Markdown
    if (parseGfm) {
      processor.use(remarkGfm)
    }

    // Markdown parsen → AST
    const ast = processor.parse(contentWithoutYAML)
    result.ast = ast

    return result
  } catch (error) {
    throw new Error(`Failed to parse Markdown string: ${error.message}`)
  }
}

/**
 * Konvertiert Markdown AST zurück zu Markdown-String
 * @param {Object} ast - Markdown Abstract Syntax Tree
 * @returns {Promise<string>} Markdown-String
 */
export async function astToMarkdown(ast) {
  const processor = unified()
    .use(remarkStringify)
  
  const markdown = processor.stringify(ast)
  return markdown
}

/**
 * Erstellt eine vorkonfigurierte unified Pipeline
 * @param {Object} options - Pipeline-Optionen
 * @returns {Object} unified Processor
 */
export function createMarkdownProcessor(options = {}) {
  const {
    parseGfm = true,
    frontmatter = true
  } = options

  const processor = unified()
    .use(remarkParse)

  if (frontmatter) {
    processor.use(remarkFrontmatter, ['yaml'])
  }

  if (parseGfm) {
    processor.use(remarkGfm)
  }

  return processor
}

/**
 * Extrahiert alle Überschriften aus einem Markdown AST
 * @param {Object} ast - Markdown AST
 * @returns {Array} Array von Überschriften mit Level und Text
 */
export function extractHeadings(ast) {
  const headings = []

  function visit(node) {
    if (node.type === 'heading') {
      headings.push({
        level: node.depth,
        text: extractTextFromNode(node)
      })
    }

    if (node.children) {
      node.children.forEach(visit)
    }
  }

  visit(ast)
  return headings
}

/**
 * Extrahiert alle Links aus einem Markdown AST
 * @param {Object} ast - Markdown AST
 * @returns {Array} Array von Links mit URL und Text
 */
export function extractLinks(ast) {
  const links = []

  function visit(node) {
    if (node.type === 'link') {
      links.push({
        url: node.url,
        title: node.title || null,
        text: extractTextFromNode(node)
      })
    }

    if (node.children) {
      node.children.forEach(visit)
    }
  }

  visit(ast)
  return links
}

/**
 * Extrahiert alle Bilder aus einem Markdown AST
 * @param {Object} ast - Markdown AST
 * @returns {Array} Array von Bildern mit URL, Alt-Text und Title
 */
export function extractImages(ast) {
  const images = []

  function visit(node) {
    if (node.type === 'image') {
      images.push({
        url: node.url,
        alt: node.alt || null,
        title: node.title || null
      })
    }

    if (node.children) {
      node.children.forEach(visit)
    }
  }

  visit(ast)
  return images
}

/**
 * Hilfsfunktion: Extrahiert Text aus einem AST-Node
 * @param {Object} node - AST-Node
 * @returns {string} Extrahierter Text
 */
function extractTextFromNode(node) {
  if (node.type === 'text') {
    return node.value
  }

  if (node.children) {
    return node.children
      .map(extractTextFromNode)
      .join('')
  }

  return ''
}
