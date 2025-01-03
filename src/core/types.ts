import * as vscode from 'vscode';

// Basic block property types
export interface CodeBlockProperty {
    type: 'identifier' | 'class' | 'keyValue';
    key: string;
    value?: string;
}

export interface CodeBlockAttributes {
    properties: CodeBlockProperty[];
    language?: string;
    identifier?: string;
    fileName?: string;
}

export type BlockType = 'referable' | 'file' | 'ignored';

// Core code block type
export interface CodeBlock {
    type: BlockType;
    identifier?: string;
    fileName?: string;
    language: string;
    content: string;
    references: string[];
    location: vscode.Location;
    indentation?: string;
    attributes: CodeBlockAttributes;
    expandedContent?: string;
    dependencies?: Set<string>;
    dependents?: Set<string>;
}

// Document state types
export interface ParsedDocument {
    uri: string;
    blocks: CodeBlock[];
    references: Map<string, CodeBlock[]>;
    fileBlocks: Map<string, CodeBlock>;
    lastModified: number;
}

export interface EntangledState {
    documents: Map<string, ParsedDocument>;
    globalReferences: Map<string, CodeBlock[]>;
    fileBlocks: Map<string, CodeBlock>;
}

// Pandoc AST types
export interface PandocASTNode {
    t: string;  // type
    c: any;     // content
}

export interface PandocAST {
    blocks: PandocASTNode[];
    meta: Record<string, any>;
    pandoc_version: string[];
}

// Error types
export interface CircularReference {
    path: string[];
    start: string;
}

// Service interfaces
export interface DocumentProcessor {
    parse(document: vscode.TextDocument): Promise<ParsedDocument>;
    getParsedDocument(uri: string): Promise<ParsedDocument | undefined>;
    invalidate(uri: string): void;
    findReferences(uri: string, identifier: string): CodeBlock[];
    findDefinition(uri: string, identifier: string): CodeBlock | undefined;
}

export class ProcessingError extends Error {
    constructor(message: string, public readonly cause?: Error) {
        super(message);
        this.name = 'ProcessingError';
    }
}
