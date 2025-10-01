/**
 * YAML Extractor
 * Extrahiert und parst YAML Front Matter aus Markdown-Inhalten
 */

import { parse as parseYaml } from 'yaml'

/**
 * Extrahiert YAML Front Matter aus Markdown-Content
 * @param {string} markdownContent - Roher Markdown-Content
 * @returns {Object|null} Geparstes YAML-Objekt oder null
 */
export function extractYAML(markdownContent) {
  if (!markdownContent || typeof markdownContent !== 'string') {
    return null
  }

  // YAML Front Matter Pattern: ---\n...\n---
  const yamlPattern = /^---\s*\n([\s\S]*?)\n---\s*\n/
  const match = markdownContent.match(yamlPattern)

  if (!match || !match[1]) {
    return null
  }

  try {
    const yamlString = match[1]
    const parsed = parseYaml(yamlString)
    return parsed
  } catch (error) {
    console.error('YAML Parse Error:', error.message)
    return {
      _error: 'YAML parsing failed',
      _errorDetails: error.message
    }
  }
}

/**
 * Entfernt YAML Front Matter aus Markdown-Content
 * @param {string} markdownContent - Markdown mit YAML Front Matter
 * @returns {string} Markdown ohne Front Matter
 */
export function removeYAML(markdownContent) {
  if (!markdownContent || typeof markdownContent !== 'string') {
    return markdownContent
  }

  const yamlPattern = /^---\s*\n[\s\S]*?\n---\s*\n/
  return markdownContent.replace(yamlPattern, '').trim()
}

/**
 * Validiert, ob ein String YAML Front Matter enthält
 * @param {string} markdownContent - Zu prüfender Content
 * @returns {boolean} True wenn YAML Front Matter vorhanden
 */
export function hasYAML(markdownContent) {
  if (!markdownContent || typeof markdownContent !== 'string') {
    return false
  }

  const yamlPattern = /^---\s*\n[\s\S]*?\n---\s*\n/
  return yamlPattern.test(markdownContent)
}
