import * as vscode from 'vscode';
import { Logger } from '../../utils/logger';
import { PandocCodeBlock, DocumentBlock, CodeBlockLocation } from './entities';
import { DocumentParseError } from '../../utils/errors';
import { LiteratePatterns } from './patterns';
import { CodeBlockType, CodeBlockProperties } from './types';

/**
 * Interface for parsing literate programming documents
 */
export interface ILiterateParser {
    parseDocument(document: vscode.TextDocument, blocks: PandocCodeBlock[]): DocumentBlock[];
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

    private parseCodeBlockProperties(attributes: string): CodeBlockProperties {
        const properties: CodeBlockProperties = {
            additionalClasses: [],
            attributes: new Map(),
            type: CodeBlockType.Ignored
        };

        // Extract identifier
        const idMatch = attributes.match(LiteratePatterns.identifierExtractor);
        if (idMatch) {
            properties.identifier = idMatch[1];
        }

        // Extract language (first class)
        const langMatch = attributes.match(LiteratePatterns.languageExtractor);
        if (langMatch) {
            properties.language = langMatch[1];
        }

        // Extract file path
        const fileMatch = attributes.match(LiteratePatterns.fileExtractor);
        if (fileMatch) {
            properties.filePath = fileMatch[1];
        }

        // Extract additional classes (after first)
        let classMatch;
        let firstClassFound = false;
        const classPattern = LiteratePatterns.classExtractor;
        while ((classMatch = classPattern.exec(attributes)) !== null) {
            if (!firstClassFound) {
                firstClassFound = true;
                continue;
            }
            properties.additionalClasses.push(classMatch[1]);
        }

        // Extract key-value attributes
        let attrMatch;
        while ((attrMatch = LiteratePatterns.attributeExtractor.exec(attributes)) !== null) {
            properties.attributes.set(attrMatch[1], attrMatch[2]);
        }

        // Determine block type
        if (properties.language) {
            if (properties.identifier) {
                properties.type = CodeBlockType.Referable;
            } else if (properties.filePath) {
                properties.type = CodeBlockType.File;
                // Use file path as identifier if not specified
                properties.identifier = properties.identifier || properties.filePath;
            }
        }

        return properties;
    }

    public parseDocument(document: vscode.TextDocument, blocks: PandocCodeBlock[]): DocumentBlock[] {
        this.logger.debug('Starting document parsing', {
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

                const references = this.findReferences(document, block);
                documentBlocks.push({
                    identifier: block.identifier,
                    content: block.content,
                    language: block.language,
                    location,
                    references: block.references,
                    referenceRanges: references,
                    dependencies: new Set<string>(),
                    dependents: new Set<string>()
                });
            }

            this.logger.debug('Document parsing completed', {
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
        this.logger.debug('Finding block location', { 
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
                        const match = line.match(LiteratePatterns.codeBlockDefinition);
                        if (match) {
                            const properties = this.parseCodeBlockProperties(match[1]);
                            if (properties.identifier === block.identifier) {
                                startLine = i;
                                blockStartPos = lineStart;
                                inCodeBlock = true;
                            }
                        }
                    } else {
                        if (startLine !== -1) {
                            return {
                                start: document.positionAt(blockStartPos),
                                end: document.positionAt(lineStart + line.length),
                                contentStart: document.positionAt(text.indexOf('\n', blockStartPos) + 1),
                                contentEnd: document.positionAt(lineStart)
                            };
                        }
                        inCodeBlock = false;
                    }
                }
            }

            return null;
        } catch (error) {
            this.logger.error('Error finding block location',
                error instanceof Error ? error : new Error(String(error)),
                { identifier: block.identifier }
            );
            return null;
        }
    }

    public findReferences(document: vscode.TextDocument, block: PandocCodeBlock): vscode.Range[] {
        this.logger.debug('Finding references', {
            identifier: block.identifier,
            uri: document.uri.toString()
        });

        const ranges: vscode.Range[] = [];
        const text = document.getText();
        const pattern = LiteratePatterns.codeBlockReference;
        let match;

        while ((match = pattern.exec(text)) !== null) {
            const ref = match[1];
            if (ref === block.identifier) {
                const startPos = document.positionAt(match.index);
                const endPos = document.positionAt(match.index + match[0].length);
                ranges.push(new vscode.Range(startPos, endPos));
            }
        }

        this.logger.debug('References found', {
            identifier: block.identifier,
            count: ranges.length
        });

        return ranges;
    }
}
