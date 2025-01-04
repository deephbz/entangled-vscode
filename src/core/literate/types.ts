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
    
    /** Pattern for extracting language from attributes */
    languageExtractor: RegExp;
    
    /** Pattern for extracting key-value attributes */
    attributeExtractor: RegExp;
}
