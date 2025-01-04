import * as vscode from 'vscode';
import { Logger } from '../../utils/logger';
import { PandocCodeBlock, DocumentBlock, CodeBlockLocation } from './entities';
import { DocumentParseError } from '../../utils/errors';
import { PATTERNS } from '../../utils/constants';

/**
 * Interface for parsing literate programming documents
 */
export interface ILiterateParser {
    parseDocumentAndDecorateBlocks(document: vscode.TextDocument, blocks: PandocCodeBlock[]): DocumentBlock[];
    findBlockLocation(document: vscode.TextDocument, block: PandocCodeBlock): CodeBlockLocation | null;
    findReferences(document: vscode.TextDocument, block: PandocCodeBlock): vscode.Range[];
}

/**
 * Default implementation of the literate programming parser
 */
export class LiterateParser implements ILiterateParser {
    private logger: Logger;

    constructor() {
        this.logger = Logger.getInstance();
    }

    public parseDocumentAndDecorateBlocks(document: vscode.TextDocument, blocks: PandocCodeBlock[]): DocumentBlock[] {
        this.logger.debug('LiterateParser::parseDocument:: Starting parsing', {
            uri: document.uri.toString(),
            blockCount: blocks.length
        });

        const documentBlocks: DocumentBlock[] = [];

        try {
            for (const block of blocks) {
                const location = this.findBlockLocation(document, block);
                if (!location) {
                    this.logger.warn('Could not find location for block', {
                        identifier: block.identifier
                    });
                    continue;
                }

                this.logger.debug('parseDocumentAndDecorateBlocks:: pandocBlock ', { block });
                const references = this.findReferences(document, block);
                documentBlocks.push({
                    ...block,
                    location,
                    referenceRanges: references,
                    dependencies: new Set<string>(block.references),
                    dependents: new Set<string>()
                });
            }

            this.logger.debug('LiterateParser::parseDocument::Document parsing completed', {
                uri: document.uri.toString(),
                parsedBlocks: documentBlocks.length
            });

            return documentBlocks;
        } catch (error) {
            throw new DocumentParseError(
                error instanceof Error ? error.message : String(error),
                document.uri.toString()
            );
        }
    }

    public findBlockLocation(document: vscode.TextDocument, block: PandocCodeBlock): CodeBlockLocation | null {
        this.logger.debug('LiterateParser::findBlockLocation::Finding block location', { 
            identifier: block.identifier,
            uri: document.uri.toString()
        });

        const text = document.getText();
        const lines = text.split('\n');
        let inCodeBlock = false;
        let startLine = -1;
        let blockStartPos = -1;

        try {
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                const lineStart = text.indexOf(lines[i], blockStartPos + 1);
                
                if (line.startsWith('```')) {
                    if (!inCodeBlock) {
                        const match = line.match(PATTERNS.CODE_BLOCK_OPEN);
                        if (match) {
                            const attributes = match[1];
                            const idMatch = attributes.match(PATTERNS.BLOCK_IDENTIFIER);
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
                            
                            this.logger.debug('LiterateParser::findBlockLocation::Block location found', {
                                identifier: block.identifier,
                                startLine: startLine,
                                endLine: i
                            });
                            
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

            this.logger.debug('LiterateParser::findBlockLocation::Block location not found', {
                identifier: block.identifier
            });
            return null;
        } catch (error) {
            if (error instanceof Error) {
                this.logger.error('Error finding block location', error, {
                    identifier: block.identifier
                });
            } else {
                this.logger.error('Error finding block location', new Error(String(error)), {
                    identifier: block.identifier
                });
            }
            return null;
        }
    }

    public findReferences(document: vscode.TextDocument, block: PandocCodeBlock): vscode.Range[] {
        this.logger.debug('LiterateParser::findReferences::Finding references', {
            identifier: block.identifier,
            uri: document.uri.toString()
        });

        const ranges: vscode.Range[] = [];
        const text = document.getText();

        try {
            for (const ref of block.references) {
                const pattern = PATTERNS.BLOCK_REFERENCE(ref);
                let match;
                
                while ((match = pattern.exec(text)) !== null) {
                    const startPos = document.positionAt(match.index);
                    const endPos = document.positionAt(match.index + match[0].length);
                    ranges.push(new vscode.Range(startPos, endPos));
                }
            }

            this.logger.debug('LiterateParser::findReferences::References found', {
                identifier: block.identifier,
                count: ranges.length
            });

            return ranges;
        } catch (error) {
            this.logger.error('Error finding references', 
                error instanceof Error ? error : new Error(String(error)),
                {
                    identifier: block.identifier
                }
            );
            return [];
        }
    }
}
