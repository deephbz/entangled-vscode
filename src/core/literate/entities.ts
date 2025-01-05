import * as vscode from 'vscode';

/**
 * Represents a code block in a Pandoc document
 */
export interface PandocCodeBlock {
    identifier: string;
    language: string;
    content: string;
    references: string[];
}

/**
 * Location information for a code block within a document
 */
export interface CodeBlockLocation {
    uri: vscode.Uri;
    range: vscode.Range;
    identifier: string;
}

/**
 * Represents a code block within a document with additional metadata
 */
export interface DocumentBlock extends PandocCodeBlock {
    location: CodeBlockLocation;
    expandedContent?: string;
    dependencies: Set<string>;
    dependents: Set<string>;
    referenceRanges: vscode.Range[];
}

/**
 * Maps block identifiers to their document blocks
 */
export interface DocumentMap {
    [identifier: string]: DocumentBlock[];
}

/**
 * Maps file URIs to their block identifiers
 */
export interface FileMap {
    [uri: string]: Set<string>;  // URI -> Set of block identifiers
}

/**
 * Represents a circular reference in the code blocks
 */
export interface CircularReference {
    path: string[];
    start: string;
}

/**
 * Pandoc AST node structure
 */
export interface PandocASTNode {
    t: string;  // type
    c: any;     // content
}

/**
 * Pandoc AST document structure
 */
export interface PandocAST {
    blocks: PandocASTNode[];
    meta: Record<string, any>;
    pandoc_version: string[];
}

/**
 * Read-only interface for document blocks
 */
export interface IReadOnlyDocumentMap {
    readonly [uri: string]: ReadonlyArray<DocumentBlock>;
}
