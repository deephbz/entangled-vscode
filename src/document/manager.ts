import * as vscode from 'vscode';
import { DocumentMap, FileMap, DocumentBlock, CircularReference } from './types';
import { PandocService } from '../pandoc/service';
import { Logger } from '../services/logger';
import { IDocumentManager, IPandocService } from '../services/interfaces';
import { DocumentParseError } from '../errors';
import { DocumentProcessor } from './processor';
import { DependencyManager } from './dependency-manager';
import { ContentExpander } from './content-expander';

/**
 * Manages document blocks, their relationships, and provides navigation capabilities
 * for the Entangled literate programming system.
 */
export class DocumentManager implements IDocumentManager {
    // Singleton instance with lazy initialization
    private static _instance?: DocumentManager;
    
    private readonly documents: DocumentMap = {};
    private readonly fileMap: FileMap = {};
    private readonly services: {
        pandoc: IPandocService;
        logger: Logger;
        processor: DocumentProcessor;
        dependencies: DependencyManager;
        expander: ContentExpander;
    };

    private constructor() {
        this.services = {
            pandoc: PandocService.getInstance(),
            logger: Logger.getInstance(),
            processor: new DocumentProcessor(),
            dependencies: new DependencyManager(),
            expander: new ContentExpander()
        };
    }

    public static getInstance(): DocumentManager {
        return this._instance ??= new DocumentManager();
    }

    /**
     * Parses a document to extract and process code blocks
     */
    async parseDocument(document: vscode.TextDocument): Promise<void> {
        const { uri } = document;
        const uriString = uri.toString();
        
        this.services.logger.info('Parsing document', { uri: uriString });
        
        try {
            const blocks = await this.extractAndProcessBlocks(document);
            this.updateDocumentBlocks(uriString, blocks);
            this.services.dependencies.updateDependencies(this.documents);
            
            this.services.logger.info('Document parsing completed', {
                blocks: Object.keys(this.documents).length,
                files: this.fileMap[uriString]?.size ?? 0
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.services.logger.error('Document parsing failed', new Error(message), { uri: uriString });
            throw new DocumentParseError(message, uriString);
        }
    }

    /**
     * Finds all definitions of a given block identifier
     */
    findDefinition(identifier: string): vscode.Location[] {
        return (this.documents[identifier] ?? [])
            .map(block => new vscode.Location(block.location.uri, block.location.range));
    }

    /**
     * Finds all references to a given block identifier
     */
    findReferences(identifier: string): vscode.Location[] {
        const blocks = this.documents[identifier] ?? [];
        if (!blocks.length) {
            this.services.logger.warn('No references found', { identifier });
            return [];
        }

        const locations = new Set<vscode.Location>();
        
        // Add definitions
        blocks.forEach(block => {
            locations.add(new vscode.Location(block.location.uri, block.location.range));
            
            // Add dependent references
            block.dependents.forEach(dependent => {
                this.documents[dependent]?.forEach(depBlock => {
                    locations.add(new vscode.Location(depBlock.location.uri, depBlock.location.range));
                });
            });
        });

        return Array.from(locations);
    }

    findCircularReferences(): CircularReference[] {
        return this.services.dependencies.findCircularReferences(this.documents);
    }

    getExpandedContent(identifier: string): string {
        return this.services.expander.expandContent(identifier, this.documents);
    }

    clearCache(): void {
        Object.keys(this.documents).forEach(key => delete this.documents[key]);
        Object.keys(this.fileMap).forEach(key => delete this.fileMap[key]);
        this.services.logger.info('Cache cleared');
    }

    // Private helper methods
    private async extractAndProcessBlocks(document: vscode.TextDocument): Promise<DocumentBlock[]> {
        const ast = await this.services.pandoc.convertToAST(document);
        const blocks = this.services.pandoc.extractCodeBlocks(ast);
        return this.services.processor.processBlocks(document, blocks);
    }

    private updateDocumentBlocks(uri: string, blocks: DocumentBlock[]): void {
        // Clear existing blocks
        if (this.fileMap[uri]) {
            this.fileMap[uri].forEach(identifier => {
                this.documents[identifier] = this.documents[identifier]?.filter(
                    block => block.location.uri.toString() !== uri
                ) ?? [];
                
                if (!this.documents[identifier]?.length) {
                    delete this.documents[identifier];
                }
            });
        }

        // Add new blocks
        this.fileMap[uri] = new Set();
        blocks.forEach(block => {
            if (!this.documents[block.identifier]) {
                this.documents[block.identifier] = [];
            }
            this.documents[block.identifier].push(block);
            this.fileMap[uri].add(block.identifier);
        });
    }
}
