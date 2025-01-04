import { ILiteratePatterns } from './types';

/**
 * Regular expression patterns for literate programming syntax
 */
export const LiteratePatterns: ILiteratePatterns = {
    /**
     * Matches code block definitions with attributes
     * Example: ```{.c #identifier-name .py .extra-class-name key="value"}
     * Groups:
     * 1. Full attributes string
     * 2. Identifier name
     */
    codeBlockDefinition: /^```\s*\{([^}]*#([^\s\}]+)[^}]*)\}/gm,

    /**
     * Matches code block references
     * Example: <<identifier-name>>
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
    identifierExtractor: /#([^\s}]+)/,

    /**
     * Extracts language from attributes string
     * Example: {.python #identifier-name}
     * Groups:
     * 1. Language name
     */
    languageExtractor: /\.([a-zA-Z0-9_-]+)(?:\s|$)/,

    /**
     * Extracts key-value attributes
     * Example: key="value"
     * Groups:
     * 1. Key
     * 2. Value
     */
    attributeExtractor: /([a-zA-Z0-9_-]+)="([^"]*)"/g
};
