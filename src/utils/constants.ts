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

/**
 * Regular expression patterns for literate programming syntax
 */
export const PATTERNS = {
    /** Pattern for code block opening with attributes */
    CODE_BLOCK_OPEN: /^```\s*\{([^}]*)\}/,
    /** Pattern for identifier in attributes */
    BLOCK_IDENTIFIER: /#([^\s}]+)/,
    /** Pattern for reference to another code block */
    BLOCK_REFERENCE: (ref: string) => new RegExp(`<<${ref}>>`, 'g'),
    /** Pattern for finding all references */
    ALL_REFERENCES: /<<([^>]+)>>/g,
    /** Pattern for finding a reference at cursor */
    REFERENCE: /<<[^>]+>>/,
    /** Pattern for finding a definition at cursor */
    DEFINITION: /#[^\s\}]+/,
    /** Pattern for finding either a reference or definition at cursor */
    REFERENCE_OR_DEFINITION: /(?:#[^\s\}]+)|(?:<<[^>]+>>)/,
    /** Pattern for finding a code block with identifier */
    CODE_BLOCK: /^```\s*\{([^}]*#[^}\s]+)[^}]*\}/gm
} as const;
