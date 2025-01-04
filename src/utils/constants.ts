/**
 * Language-related constants
 */
export const LANGUAGE = {
    /** The language ID for markdown documents */
    ID: 'markdown',
    /** The display name for the extension */
    DISPLAY_NAME: 'Entangled',
    /** The base markdown format for pandoc */
    PANDOC_FORMAT: 'markdown',
    /** The scope name for syntax highlighting */
    SYNTAX_SCOPE: 'text.markdown.entangled'
} as const;

/**
 * File system related constants
 */
export const FILES = {
    /** The syntax definition file path */
    SYNTAX_FILE: './syntaxes/entangled.language-injection.json'
} as const;

/**
 * Document scheme constants
 */
export const SCHEMES = {
    /** File scheme for document URIs */
    FILE: 'file'
} as const;
