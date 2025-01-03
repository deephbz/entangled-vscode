import * as vscode from 'vscode';
import { PandocCodeBlock } from '../pandoc/types';
import { DocumentBlock, CodeBlockLocation } from './types';
import { Logger } from '../services/logger';

export class DocumentProcessor {
    private logger: Logger;

    constructor() {
        this.logger = Logger.getInstance();
    }

    public processBlocks(document: vscode.TextDocument, blocks: PandocCodeBlock[]): DocumentBlock[] {
        return blocks
            .map(block => {
                const location = this.findBlockLocation(document, block);
                if (location) {
                    return {
                        ...block,
                        location,
                        dependencies: new Set(block.references),
                        dependents: new Set()
                    };
                }
                this.logger.warn('Could not find location for block', { identifier: block.identifier });
                return null;
            })
            .filter((block): block is DocumentBlock => block !== null);
    }

    private findBlockLocation(document: vscode.TextDocument, block: PandocCodeBlock): CodeBlockLocation | null {
        this.logger.debug('Finding block location', { identifier: block.identifier });
        const text = document.getText();
        const lines = text.split('\n');
        let inCodeBlock = false;
        let startLine = -1;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            
            if (line.startsWith('```')) {
                if (!inCodeBlock) {
                    const match = line.match(/^```\s*\{([^}]*)\}/);
                    if (match) {
                        const attributes = match[1];
                        const idMatch = attributes.match(/#([^\s}]+)/);
                        if (idMatch && idMatch[1] === block.identifier) {
                            startLine = i;
                            inCodeBlock = true;
                        }
                    }
                } else {
                    if (startLine !== -1) {
                        return {
                            uri: document.uri,
                            range: new vscode.Range(
                                new vscode.Position(startLine, 0),
                                new vscode.Position(i, lines[i].length)
                            ),
                            identifier: block.identifier
                        };
                    }
                    inCodeBlock = false;
                }
            }
        }
        return null;
    }
}
