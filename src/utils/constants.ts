/**
 * Language-related constants
 */
export const LANGUAGE = {
    /** The language ID for markdown documents */
    ID: 'markdown',
    /** The display name for the extension */
    DISPLAY_NAME: 'Entangled',
    /** The base markdown format for pandoc */
    PANDOC_FORMAT: 'markdown'
} as const;

/**
 * Document scheme constants
 */
export const SCHEMES = {
    /** File scheme for document URIs */
    FILE: 'file'
} as const;
