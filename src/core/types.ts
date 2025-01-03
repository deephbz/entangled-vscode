import * as vscode from 'vscode';

export interface CodeBlock {
    type: 'referable' | 'file' | 'ignored';
    identifier: string;
    language: string;
    content: string;
    references: string[];
    location: vscode.Location;
    fileName?: string;
    indentation?: string;
}

export interface ParsedDocument {
    uri: string;
    blocks: CodeBlock[];
    references: Map<string, CodeBlock[]>;
    fileBlocks: Map<string, CodeBlock>;
    version: number;
}

export interface EntangledState {
    // Document state
    documents: Map<string, ParsedDocument>;
    
    // Cross-document references
    globalReferences: Map<string, CodeBlock[]>;
    
    // File blocks across all documents
    fileBlocks: Map<string, CodeBlock>;
}

export interface DocumentProcessor {
    // Initial parsing of the document
    parse(document: vscode.TextDocument): Promise<ParsedDocument>;
    
    // Get cached parse results or parse if needed
    getParsedDocument(uri: string): Promise<ParsedDocument | undefined>;
    
    // Clear cache for a document
    invalidate(uri: string): void;
}
