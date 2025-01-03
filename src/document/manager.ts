import * as vscode from 'vscode';
import { DocumentMap, FileMap, DocumentBlock } from './types';
import { PandocService } from '../pandoc/service';
import { Logger } from '../services/logger';
import { IDocumentManager, IPandocService } from '../services/interfaces';
import { DocumentParseError } from '../errors';
import { DocumentProcessor } from './processor';
import { DependencyManager } from './dependency-manager';
import { ContentExpander } from './content-expander';

export class DocumentManager implements IDocumentManager {
    private static instance: DocumentManager;
    protected documents: DocumentMap = {};
    private fileMap: FileMap = {};
    private pandocService: IPandocService;
    private logger: Logger;
    private processor: DocumentProcessor;
    private dependencyManager: DependencyManager;
    private contentExpander: ContentExpander;

    private constructor() {
        this.pandocService = PandocService.getInstance();
        this.logger = Logger.getInstance();
        this.processor = new DocumentProcessor();
        this.dependencyManager = new DependencyManager();
        this.contentExpander = new ContentExpander();
    }

    public static getInstance(): DocumentManager {
        if (!DocumentManager.instance) {
            DocumentManager.instance = new DocumentManager();
        }
        return DocumentManager.instance;
    }

    async parseDocument(document: vscode.TextDocument): Promise<void> {
        const uri = document.uri.toString();
        this.logger.info('Parsing document', { uri });
        
        try {
            const ast = await this.pandocService.convertToAST(document);
            const blocks = this.pandocService.extractCodeBlocks(ast);
            
            // Clear existing blocks for this document
            this.clearDocumentBlocks(uri);
            
            // Process and add new blocks
            const processedBlocks = this.processor.processBlocks(document, blocks);
            this.addDocumentBlocks(uri, processedBlocks);

            // Update dependencies
            this.dependencyManager.updateDependencies(this.documents);
            
            this.logger.info('Document parsing completed', {
                totalBlocks: Object.keys(this.documents).length,
                fileBlocks: Array.from(this.fileMap[uri] || [])
            });
        } catch (error) {
            this.logger.error('Failed to parse document', error instanceof Error ? error : new Error(String(error)), { uri });
            throw new DocumentParseError(error instanceof Error ? error.message : String(error), uri);
        }
    }

    private clearDocumentBlocks(uri: string): void {
        if (this.fileMap[uri]) {
            this.logger.debug('Clearing existing blocks', { uri });
            for (const identifier of this.fileMap[uri]) {
                this.documents[identifier] = this.documents[identifier]?.filter(
                    block => block.location.uri.toString() !== uri
                ) || [];
                if (this.documents[identifier].length === 0) {
                    delete this.documents[identifier];
                }
            }
        }
        this.fileMap[uri] = new Set();
    }

    private addDocumentBlocks(uri: string, blocks: DocumentBlock[]): void {
        for (const block of blocks) {
            if (!this.documents[block.identifier]) {
                this.documents[block.identifier] = [];
            }
            this.documents[block.identifier].push(block);
            this.fileMap[uri].add(block.identifier);
        }
    }

    findDefinition(identifier: string): vscode.Location[] {
        const blocks = this.documents[identifier];
        if (!blocks?.length) {
            this.logger.warn('No definition found for block', { identifier });
            return [];
        }

        return blocks.map(block => new vscode.Location(block.location.uri, block.location.range));
    }

    findReferences(identifier: string): vscode.Location[] {
        const blocks = this.documents[identifier];
        if (!blocks?.length) {
            this.logger.warn('No references found for block', { identifier });
            return [];
        }

        const locations: vscode.Location[] = [];
        
        // Add all reference ranges from all blocks
        for (const block of blocks) {
            for (const range of block.referenceRanges) {
                locations.push(new vscode.Location(block.location.uri, range));
            }
        }

        // Add all blocks that reference this identifier
        for (const block of blocks) {
            for (const dependent of block.dependents) {
                const depBlocks = this.documents[dependent];
                if (depBlocks) {
                    locations.push(...depBlocks.map(b => new vscode.Location(b.location.uri, b.location.range)));
                }
            }
        }

        return locations;
    }

    findCircularReferences() {
        return this.dependencyManager.findCircularReferences(this.documents);
    }

    getExpandedContent(identifier: string): string {
        return this.contentExpander.expandContent(identifier, this.documents);
    }

    clearCache(): void {
        this.documents = {};
        this.fileMap = {};
        this.logger.info('Cache cleared');
    }
}
