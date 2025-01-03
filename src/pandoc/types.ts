import * as vscode from 'vscode';

/**
 * Represents a code block in a Pandoc markdown document.
 */
export interface PandocCodeBlock {
    /** Unique identifier of the code block */
    identifier: string;
    /** Programming language of the code block */
    language: string;
    /** Raw content of the code block */
    content: string;
    /** List of referenced code block identifiers */
    references: string[];
    /** Line number in the source document (0-based) */
    lineNumber: number;
    /** Optional target file name for the code block */
    fileName?: string;
}

/**
 * Represents a node in the Pandoc AST.
 */
export interface PandocASTNode {
    /** Node type identifier */
    t: string;
    /** Node content - structure varies by node type */
    c: [
        [string, string[], [string, string][]], // Attributes: [identifier, classes, key-value pairs]
        string                                  // Content
    ] | any;
}

/**
 * Represents the root of a Pandoc AST.
 */
export interface PandocAST {
    /** List of block-level nodes */
    blocks: PandocASTNode[];
    /** Optional metadata object */
    meta?: Record<string, unknown>;
    /** Optional Pandoc version information */
    pandoc_version?: string[];
}
