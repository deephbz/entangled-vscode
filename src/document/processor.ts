import * as vscode from 'vscode';
import { PandocCodeBlock } from '../pandoc/types';
import { DocumentBlock, CodeBlockLocation } from './types';
import { Logger } from '../services/logger';

interface BlockAttributes {
    language?: string;
    identifier?: string;
    file?: string;
}

/**
 * Processes Pandoc code blocks into document blocks with location information
 * and dependency tracking.
 */
export class DocumentProcessor {
    private static readonly BLOCK_START = /^```\s*\{([^}]*)\}/;
    private static readonly BLOCK_END = /^```\s*$/;
    private static readonly ATTRIBUTE_PATTERNS = {
        identifier: /#([^\s}]+)/,
        file: /file=([^\s}]+)/,
        language: /^\.([^\s}]+)/
    };

    private readonly logger: Logger;

    constructor() {
        this.logger = Logger.getInstance();
    }

    /**
     * Processes Pandoc code blocks into document blocks with location and dependency information
     */
    public processBlocks(document: vscode.TextDocument, blocks: PandocCodeBlock[]): DocumentBlock[] {
        const documentText = document.getText();
        const blockLocations = this.scanBlockLocations(documentText);
        
        return blocks
            .map(block => this.createDocumentBlock(document, block, blockLocations))
            .filter((block): block is DocumentBlock => block !== null);
    }

    /**
     * Scans the document text to create a map of block identifiers to their locations
     * This is more efficient than searching for each block individually
     */
    private scanBlockLocations(documentText: string): Map<string, vscode.Range> {
        const locations = new Map<string, vscode.Range>();
        const lines = documentText.split('\n');
        let currentBlock: { start: number; identifier: string } | null = null;

        lines.forEach((line, lineNumber) => {
            const trimmedLine = line.trim();

            if (!currentBlock) {
                // Look for block start
                const startMatch = trimmedLine.match(DocumentProcessor.BLOCK_START);
                if (startMatch) {
                    const attributes = this.parseBlockAttributes(startMatch[1]);
                    if (attributes.identifier) {
                        currentBlock = { start: lineNumber, identifier: attributes.identifier };
                    }
                }
            } else if (trimmedLine.match(DocumentProcessor.BLOCK_END)) {
                // Found block end
                locations.set(
                    currentBlock.identifier,
                    new vscode.Range(
                        new vscode.Position(currentBlock.start, 0),
                        new vscode.Position(lineNumber, line.length)
                    )
                );
                currentBlock = null;
            }
        });

        return locations;
    }

    /**
     * Creates a document block from a Pandoc code block and its location
     */
    private createDocumentBlock(
        document: vscode.TextDocument,
        block: PandocCodeBlock,
        locations: Map<string, vscode.Range>
    ): DocumentBlock | null {
        const range = locations.get(block.identifier);
        
        if (!range) {
            this.logger.warn('Block location not found', {
                identifier: block.identifier,
                document: document.uri.toString()
            });
            return null;
        }

        const location: CodeBlockLocation = {
            uri: document.uri,
            range,
            identifier: block.identifier
        };

        return {
            ...block,
            location,
            dependencies: new Set(block.references),
            dependents: new Set()
        };
    }

    /**
     * Parses block attributes from a Pandoc code block header
     */
    private parseBlockAttributes(attributeString: string): BlockAttributes {
        const attributes: BlockAttributes = {};
        
        // Match patterns against the attribute string
        Object.entries(DocumentProcessor.ATTRIBUTE_PATTERNS).forEach(([key, pattern]) => {
            const match = attributeString.match(pattern);
            if (match) {
                attributes[key as keyof BlockAttributes] = match[1];
            }
        });

        return attributes;
    }
}
