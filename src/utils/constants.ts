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
 * Basic building blocks for regex patterns
 */
const BASIC_PATTERNS = {
    /** Three backticks that start/end a code block */
    FENCE: '```',
    /** Reference delimiters */
    REF_OPEN: '<<',
    REF_CLOSE: '>>',
    /** Attribute delimiters */
    ATTR_OPEN: '{',
    ATTR_CLOSE: '}',
    /** Attribute types */
    IDENTIFIER: '#[^\\s}]+',
    LANGUAGE: '\\.[^\\s}]+',
    KEY_VALUE: '[^#.][^\\s=}]+=(?:[^\\s}]+)?'
} as const;

/** Pattern for reference content */
const REF_CONTENT = '[^>]+';

/**
 * Pre-computed regex patterns for literate programming syntax
 */
export const PATTERNS = {
    /** Basic building blocks for pattern composition */
    BASIC: BASIC_PATTERNS,

    /** Pattern for code block opening with attributes */
    CODE_BLOCK_OPEN: new RegExp(`^${BASIC_PATTERNS.FENCE}\\s*\\${BASIC_PATTERNS.ATTR_OPEN}([^${BASIC_PATTERNS.ATTR_CLOSE}]*)\\${BASIC_PATTERNS.ATTR_CLOSE}`),

    /** Pattern for finding references */
    REFERENCE: new RegExp(`${BASIC_PATTERNS.REF_OPEN}${REF_CONTENT}${BASIC_PATTERNS.REF_CLOSE}`),

    /** Pattern for finding all references */
    ALL_REFERENCES: new RegExp(`${BASIC_PATTERNS.REF_OPEN}(${REF_CONTENT})${BASIC_PATTERNS.REF_CLOSE}`, 'g'),

    /** Pattern for reference to another code block */
    BLOCK_REFERENCE: (ref: string) => 
        new RegExp(`${BASIC_PATTERNS.REF_OPEN}${ref}${BASIC_PATTERNS.REF_CLOSE}`, 'g'),

    /** Pattern for identifier in attributes */
    BLOCK_IDENTIFIER: new RegExp(BASIC_PATTERNS.IDENTIFIER),

    /** Pattern for finding a definition */
    DEFINITION: new RegExp(BASIC_PATTERNS.IDENTIFIER),

    /** Pattern for finding either a reference or definition */
    REFERENCE_OR_DEFINITION: new RegExp(
        `(?:${BASIC_PATTERNS.IDENTIFIER})|(?:${BASIC_PATTERNS.REF_OPEN}${REF_CONTENT}${BASIC_PATTERNS.REF_CLOSE})`
    ),

    /** Pattern for finding a code block with identifier */
    CODE_BLOCK: new RegExp(
        `^${BASIC_PATTERNS.FENCE}\\s*\\${BASIC_PATTERNS.ATTR_OPEN}([^${BASIC_PATTERNS.ATTR_CLOSE}]*${BASIC_PATTERNS.IDENTIFIER}[^${BASIC_PATTERNS.ATTR_CLOSE}]*)\\${BASIC_PATTERNS.ATTR_CLOSE}`,
        'gm'
    )
} as const;
