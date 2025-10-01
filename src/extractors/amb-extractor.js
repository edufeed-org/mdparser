/**
 * AMB Metadata Extractor
 * Extrahiert und transformiert Schema.org-konforme AMB-Metadaten
 * aus YAML Front Matter
 */

/**
 * Extrahiert AMB-konforme Metadaten aus YAML-Objekt
 * @param {Object} yamlObject - Geparstes YAML Front Matter
 * @returns {Object} Schema.org-konforme Metadaten
 */
export function extractAMBMetadata(yamlObject) {
  if (!yamlObject || typeof yamlObject !== 'object') {
    return createEmptyMetadata()
  }

  const warnings = []
  const commonMetadata = yamlObject.commonMetadata || {}

  // Basis-Metadaten extrahieren
  const metadata = {
    '@context': commonMetadata['@context'] || 'https://schema.org/',
    type: commonMetadata.type || 'LearningResource',
    
    // Titel
    name: extractField(commonMetadata, 'name', yamlObject.title, warnings),
    
    // Beschreibung
    description: extractField(
      commonMetadata, 
      'description', 
      yamlObject.summary || yamlObject.description, 
      warnings
    ),
    
    // Lizenz
    license: commonMetadata.license || null,
    
    // ID/URL
    id: commonMetadata.id || commonMetadata.url || yamlObject.url || null,
    
    // Sprache
    inLanguage: commonMetadata.inLanguage || null,
    
    // Veröffentlichungsdatum
    datePublished: extractDate(
      commonMetadata.datePublished || yamlObject.datePublished
    ),
    
    // Autoren/Creator
    creator: extractCreators(commonMetadata.creator, yamlObject.author),
    
    // Bild
    image: extractImage(commonMetadata.image, yamlObject.cover?.image),
    
    // Themen/Tags
    about: commonMetadata.about || null,
    
    // Lernressourcentyp
    learningResourceType: commonMetadata.learningResourceType || null,
    
    // Bildungsniveau
    educationalLevel: commonMetadata.educationalLevel || null,
    
    // Status
    creativeWorkStatus: commonMetadata.creativeWorkStatus || null
  }

  // Warnings hinzufügen wenn vorhanden
  if (warnings.length > 0) {
    metadata._warnings = warnings
  }

  // Zusätzliche Metadaten aus staticSiteGenerator (Hugo/PaperMod)
  if (yamlObject.tags) {
    metadata._tags = yamlObject.tags
  }

  return metadata
}

/**
 * Erstellt leeres Metadaten-Objekt mit Defaults
 * @returns {Object} Leeres Metadaten-Objekt
 */
function createEmptyMetadata() {
  return {
    '@context': 'https://schema.org/',
    type: 'LearningResource',
    name: null,
    description: null,
    _warnings: ['Keine YAML-Metadaten gefunden']
  }
}

/**
 * Extrahiert ein Feld mit Fallback und Warning
 * @param {Object} source - Haupt-Quelle
 * @param {string} field - Feldname
 * @param {*} fallback - Fallback-Wert
 * @param {Array} warnings - Warning-Array
 * @returns {*} Extrahierter Wert
 */
function extractField(source, field, fallback, warnings) {
  if (source && source[field]) {
    return source[field]
  }
  
  if (fallback) {
    warnings.push(`Feld 'commonMetadata.${field}' fehlt, verwende Fallback`)
    return fallback
  }
  
  warnings.push(`Pflichtfeld 'commonMetadata.${field}' fehlt`)
  return null
}

/**
 * Extrahiert und normalisiert Datum
 * @param {string|Date} dateValue - Datum als String oder Date-Objekt
 * @returns {string|null} ISO 8601 Datum oder null
 */
function extractDate(dateValue) {
  if (!dateValue) return null
  
  try {
    const date = new Date(dateValue)
    return date.toISOString().split('T')[0] // YYYY-MM-DD
  } catch (error) {
    return dateValue // Falls Parsing fehlschlägt, Original zurückgeben
  }
}

/**
 * Extrahiert Creator/Author-Informationen
 * @param {Array|Object} creators - Creator aus commonMetadata
 * @param {Array|string} authors - Author aus staticSiteGenerator
 * @returns {Array|null} Array von Creator-Objekten
 */
function extractCreators(creators, authors) {
  // Priorität: commonMetadata.creator
  if (creators) {
    if (Array.isArray(creators)) {
      return creators.map(normalizeCreator)
    }
    return [normalizeCreator(creators)]
  }
  
  // Fallback: author (einfacher String oder Array)
  if (authors) {
    if (Array.isArray(authors)) {
      return authors.map(name => ({
        type: 'Person',
        name: name
      }))
    }
    return [{
      type: 'Person',
      name: authors
    }]
  }
  
  return null
}

/**
 * Normalisiert Creator-Objekt nach Schema.org
 * @param {Object} creator - Creator-Objekt
 * @returns {Object} Normalisiertes Creator-Objekt
 */
function normalizeCreator(creator) {
  if (typeof creator === 'string') {
    return {
      type: 'Person',
      name: creator
    }
  }
  
  const normalized = {
    type: creator.type || 'Person'
  }
  
  // Person
  if (creator.givenName || creator.familyName) {
    normalized.givenName = creator.givenName
    normalized.familyName = creator.familyName
    normalized.name = `${creator.givenName || ''} ${creator.familyName || ''}`.trim()
  } else if (creator.name) {
    normalized.name = creator.name
  }
  
  // ID (ORCID, ROR, etc.)
  if (creator.id) {
    normalized.id = creator.id
  }
  
  // Affiliation
  if (creator.affiliation) {
    normalized.affiliation = normalizeOrganization(creator.affiliation)
  }
  
  return normalized
}

/**
 * Normalisiert Organization-Objekt
 * @param {Object|string} org - Organization
 * @returns {Object} Normalisiertes Organization-Objekt
 */
function normalizeOrganization(org) {
  if (typeof org === 'string') {
    return {
      type: 'Organization',
      name: org
    }
  }
  
  return {
    type: 'Organization',
    name: org.name,
    id: org.id || null
  }
}

/**
 * Extrahiert Bild-URL
 * @param {string} ambImage - Bild aus commonMetadata
 * @param {string} coverImage - Bild aus cover
 * @returns {string|null} Bild-URL
 */
function extractImage(ambImage, coverImage) {
  return ambImage || coverImage || null
}

/**
 * Validiert AMB-Metadaten auf Vollständigkeit
 * @param {Object} metadata - Zu validierende Metadaten
 * @returns {Object} Validierungs-Ergebnis
 */
export function validateAMBMetadata(metadata) {
  const errors = []
  const warnings = []
  
  // Pflichtfelder
  const requiredFields = ['name', 'description', 'license']
  
  requiredFields.forEach(field => {
    if (!metadata[field]) {
      errors.push(`Pflichtfeld fehlt: ${field}`)
    }
  })
  
  // Empfohlene Felder
  const recommendedFields = ['creator', 'datePublished', 'about', 'id']
  
  recommendedFields.forEach(field => {
    if (!metadata[field]) {
      warnings.push(`Empfohlenes Feld fehlt: ${field}`)
    }
  })
  
  return {
    valid: errors.length === 0,
    errors,
    warnings
  }
}
