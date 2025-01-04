/**
 * Interface defining the regular expression patterns used for literate programming
 */
export interface ILiteratePatterns {
    /** Pattern for matching code block definitions with attributes */
    codeBlockDefinition: RegExp;
    
    /** Pattern for matching code block references */
    codeBlockReference: RegExp;
    
    /** Pattern for extracting identifier from attributes */
    identifierExtractor: RegExp;
    
    /** Pattern for extracting first class as language */
    languageExtractor: RegExp;

    /** Pattern for extracting file path from attributes */
    fileExtractor: RegExp;
    
    /** Pattern for extracting key-value attributes */
    attributeExtractor: RegExp;

    /** Pattern for extracting additional classes */
    classExtractor: RegExp;
}

/**
 * Types of code blocks as defined in the syntax documentation
 */
export enum CodeBlockType {
    /** Has exactly one reference id and a language class */
    Referable = 'referable',
    
    /** Has a file path and a language class */
    File = 'file',
    
    /** Anything not matching the previous two */
    Ignored = 'ignored'
}

/**
 * Properties that can be extracted from a code block's attributes
 */
export interface CodeBlockProperties {
    /** The block's identifier (from #identifier) */
    identifier?: string;
    
    /** The block's language (first .class) */
    language?: string;
    
    /** The target file path (from file=path) */
    filePath?: string;
    
    /** Additional classes (after the first language class) */
    additionalClasses: string[];
    
    /** Any key-value attributes */
    attributes: Map<string, string>;
    
    /** The type of code block */
    type: CodeBlockType;
}
