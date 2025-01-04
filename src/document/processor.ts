import * as vscode from 'vscode';
import { PandocCodeBlock } from '../pandoc/types';
import { DocumentBlock, CodeBlockLocation } from './types';
import { Logger } from '../utils/logger';

export class DocumentProcessor {
    private logger: Logger;

    constructor() {
        this.logger = Logger.getInstance();
    }

    private findBlockLocation(document: vscode.TextDocument, block: PandocCodeBlock): CodeBlockLocation | null {
        this.logger.debug('Finding block location', { identifier: block.identifier });
        const text = document.getText();
        const lines = text.split('\n');
        let inCodeBlock = false;
        let startLine = -1;
        let blockStartPos = -1;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            const lineStart = text.indexOf(lines[i], blockStartPos + 1);
            
            if (line.startsWith('```')) {
                if (!inCodeBlock) {
                    const match = line.match(/^```\s*\{([^}]*)\}/);
                    if (match) {
                        const attributes = match[1];
                        const idMatch = attributes.match(/#([^\s}]+)/);
                        if (idMatch && idMatch[1] === block.identifier) {
                            startLine = i;
                            blockStartPos = lineStart;
                            inCodeBlock = true;
                        }
                    }
                } else {
                    // Found the end of the code block
                    if (startLine !== -1) {
                        const startPos = document.positionAt(blockStartPos);
                        const endPos = document.positionAt(lineStart + line.length);
                        return {
                            uri: document.uri,
                            range: new vscode.Range(startPos, endPos),
                            identifier: block.identifier
                        };
                    }
                    inCodeBlock = false;
                }
            }
        }

        return null;
    }

    private findReferences(document: vscode.TextDocument, block: PandocCodeBlock): vscode.Range[] {
        const text = document.getText();
        const ranges: vscode.Range[] = [];
        const refRegex = new RegExp(`<<${block.identifier}>>`, 'g');
        let match;

        while ((match = refRegex.exec(text)) !== null) {
            const startPos = document.positionAt(match.index);
            const endPos = document.positionAt(match.index + match[0].length);
            ranges.push(new vscode.Range(startPos, endPos));
        }

        return ranges;
    }

    public processBlocks(document: vscode.TextDocument, blocks: PandocCodeBlock[]): DocumentBlock[] {
        const processedBlocks: DocumentBlock[] = [];
        const referenceMap = new Map<string, Set<string>>();

        // First pass: Create blocks and build reference map
        for (const block of blocks) {
            const location = this.findBlockLocation(document, block);
            if (location) {
                const processedBlock: DocumentBlock = {
                    ...block,
                    location,
                    dependencies: new Set(block.references),
                    dependents: new Set(),
                    referenceRanges: this.findReferences(document, block)
                };
                processedBlocks.push(processedBlock);

                // Build reference map
                for (const ref of block.references) {
                    if (!referenceMap.has(ref)) {
                        referenceMap.set(ref, new Set());
                    }
                    referenceMap.get(ref)!.add(block.identifier);
                }
            } else {
                this.logger.warn('Could not find location for block', { identifier: block.identifier });
            }
        }

        // Second pass: Update dependents
        for (const block of processedBlocks) {
            const dependents = referenceMap.get(block.identifier);
            if (dependents) {
                block.dependents = dependents;
            }
        }

        return processedBlocks;
    }
}
