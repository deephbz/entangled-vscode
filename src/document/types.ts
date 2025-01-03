import { PandocCodeBlock } from '../pandoc/types';
import * as vscode from 'vscode';

/**
 * Represents the location of a code block in a document.
 */
export interface CodeBlockLocation {
    /** URI of the document containing the code block */
    uri: vscode.Uri;
    /** Range in the document where the code block is located */
    range: vscode.Range;
    /** Identifier of the code block */
    identifier: string;
}

/**
 * Represents a code block with its location and relationships.
 * Extends PandocCodeBlock with document-specific information.
 */
export interface DocumentBlock extends PandocCodeBlock {
    /** Location of the code block in the document */
    location: CodeBlockLocation;
    /** Expanded content with all references resolved */
    expandedContent?: string;
    /** Set of code block identifiers this block depends on */
    dependencies: Set<string>;
    /** Set of code block identifiers that depend on this block */
    dependents: Set<string>;
}

/**
 * Maps code block identifiers to their document blocks.
 * Multiple blocks can share the same identifier across different files.
 */
export type DocumentMap = Record<string, DocumentBlock[]>;

/**
 * Maps document URIs to their code block identifiers.
 */
export type FileMap = Record<string, Set<string>>;

/**
 * Represents a circular reference in code block dependencies.
 */
export interface CircularReference {
    /** Path of identifiers forming the circular reference */
    path: string[];
    /** Starting identifier of the circular reference */
    start: string;
}
