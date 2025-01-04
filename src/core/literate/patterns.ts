import { ILiteratePatterns } from './types';

/**
 * Regular expression patterns for literate programming syntax
 */
export const LiteratePatterns: ILiteratePatterns = {
    /**
     * Matches code block definitions with attributes
     * Example: ``` {.rust #hello-rust .extra-class key="value"}
     * Groups:
     * 1. Full attributes string
     * 2. Identifier name (if present)
     * 3. Language class (first class in attributes)
     * 4. File path (if present)
     */
    codeBlockDefinition: /^```\s*\{([^}]*?(?:#([^\s\}]+))?[^}]*?(?:\.[a-zA-Z0-9_-]+(?:\s|$))?[^}]*?(?:file=([^\s\}]+))?[^}]*)\}/gm,

    /**
     * Matches code block references
     * Example: <<hello-rust>>
     * Groups:
     * 1. Identifier name
     */
    codeBlockReference: /<<([^>\s]+)>>/g,

    /**
     * Extracts identifier from attributes string
     * Example: .c #identifier-name .py key="value"
     * Groups:
     * 1. Identifier name
     */
    identifierExtractor: /#([^\s\}]+)/,

    /**
     * Extracts first class as language from attributes string
     * Example: {.python #identifier-name}
     * Groups:
     * 1. Language name
     */
    languageExtractor: /\.([a-zA-Z0-9_-]+)(?:\s|$)/,

    /**
     * Extracts file path from attributes
     * Example: file=src/main.rs
     * Groups:
     * 1. File path
     */
    fileExtractor: /file=([^\s\}]+)/,

    /**
     * Extracts key-value attributes
     * Example: key="value"
     * Groups:
     * 1. Key
     * 2. Value (without quotes)
     */
    attributeExtractor: /([a-zA-Z0-9_-]+)="([^"]*)"/g,

    /**
     * Extracts additional classes (after the first language class)
     * Example: .extra-class-name
     * Groups:
     * 1. Class name
     */
    classExtractor: /\.([a-zA-Z0-9_-]+)(?:\s|$)/g
};
