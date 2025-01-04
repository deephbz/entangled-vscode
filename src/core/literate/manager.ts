import * as vscode from 'vscode';
import { Logger } from '../../utils/logger';
import { DocumentMap, FileMap, DocumentBlock, CircularReference } from './entities';
import { ILiterateParser, LiterateParser } from './parser';
import { BlockNotFoundError, DocumentParseError, EntangledError, BlockSyntaxError, CircularReferenceError } from '../../utils/errors';
import { PandocService } from '../pandoc/service'; // Assuming PandocService is imported from this location

export interface ILiterateManager {
    parseDocument(document: vscode.TextDocument): Promise<void>;
    findDefinition(identifier: string): vscode.Location[];
    findReferences(identifier: string): vscode.Location[];
    findCircularReferences(): CircularReference[];
    getExpandedContent(identifier: string): string;
    clearCache(): void;
}

export class LiterateManager implements ILiterateManager {
    private static instance: LiterateManager;
    protected documents: DocumentMap = {};
    private fileMap: FileMap = {};
    private logger: Logger;
    private parser: ILiterateParser;

    private constructor() {
        this.logger = Logger.getInstance();
        this.parser = new LiterateParser();
    }

    public static getInstance(): LiterateManager {
        if (!LiterateManager.instance) {
            LiterateManager.instance = new LiterateManager();
        }
        return LiterateManager.instance;
    }

    async parseDocument(document: vscode.TextDocument): Promise<void> {
        const uri = document.uri.toString();
        this.logger.debug('Parsing document', { uri });
        
        try {
            const blocks = await this.extractCodeBlocks(document);
            
            if (blocks.length === 0) {
                this.logger.debug('No code blocks found', { uri });
                return;
            }
            
            this.logger.debug('Code blocks extracted', { count: blocks.length });
            
            // Clear existing blocks for this document
            this.clearDocumentBlocks(uri);
            
            // Process and add new blocks
            try {
                const processedBlocks = this.parser.parseDocument(document, blocks);
                this.logger.debug('Blocks processed', { 
                    totalBlocks: processedBlocks.length,
                    withIdentifiers: processedBlocks.filter(b => b.identifier).length
                });
                
                this.addDocumentBlocks(uri, processedBlocks);
            } catch (error) {
                throw new DocumentParseError(
                    error instanceof Error ? error.message : String(error),
                    uri
                );
            }

            // Update dependencies
            this.updateDependencies();
            
            // Check for circular references
            const circular = this.findCircularReferences();
            if (circular.length > 0) {
                this.logger.warn('Circular references detected', { 
                    count: circular.length,
                    references: circular.map(ref => ref.path)
                });
            }
        } catch (error) {
            if (error instanceof EntangledError) {
                throw error;
            }
            throw new DocumentParseError(
                error instanceof Error ? error.message : String(error),
                uri
            );
        }
    }

    private async extractCodeBlocks(document: vscode.TextDocument): Promise<DocumentBlock[]> {
        const pandocService = PandocService.getInstance();
        try {
            const ast = await pandocService.convertToAST(document);
            const pandocBlocks = pandocService.extractCodeBlocks(ast);
            
            // Convert PandocCodeBlock to DocumentBlock
            return pandocBlocks.map(block => ({
                ...block,
                location: {
                    uri: document.uri,
                    range: new vscode.Range(0, 0, 0, 0), // This will be updated by the parser
                    identifier: block.identifier
                },
                dependencies: new Set(block.references),
                dependents: new Set(),
                referenceRanges: []
            }));
        } catch (error) {
            this.logger.error('Failed to extract code blocks', error instanceof Error ? error : new Error(String(error)));
            throw error;
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

    private updateDependencies(): void {
        this.logger.debug('Updating document dependencies');
        
        // Clear existing dependents
        for (const blocks of Object.values(this.documents)) {
            for (const block of blocks) {
                block.dependents.clear();
            }
        }

        // Update dependents based on dependencies
        for (const blocks of Object.values(this.documents)) {
            for (const block of blocks) {
                for (const dep of block.dependencies) {
                    const depBlocks = this.documents[dep];
                    if (depBlocks) {
                        for (const depBlock of depBlocks) {
                            depBlock.dependents.add(block.identifier);
                        }
                    }
                }
            }
        }
    }

    findDefinition(identifier: string): vscode.Location[] {
        this.logger.debug('Finding definition', { identifier });
        
        const locations = Object.values(this.documents)
            .flatMap(blocks => blocks)
            .filter(block => block.identifier === identifier)
            .map(block => new vscode.Location(block.location.uri, block.location.range));

        if (locations.length === 0) {
            this.logger.debug('No definitions found', { identifier });
        } else {
            this.logger.debug('Definitions found', { 
                identifier, 
                count: locations.length,
                locations: locations.map(loc => loc.uri.toString())
            });
        }

        return locations;
    }

    findReferences(identifier: string): vscode.Location[] {
        this.logger.debug('Finding references', { identifier });
        
        const locations = Object.values(this.documents)
            .flatMap(blocks => blocks)
            .filter(block => block.dependencies.has(identifier))
            .map(block => new vscode.Location(block.location.uri, block.location.range));

        if (locations.length === 0) {
            this.logger.debug('No references found', { identifier });
        } else {
            this.logger.debug('References found', { 
                identifier, 
                count: locations.length,
                locations: locations.map(loc => loc.uri.toString())
            });
        }

        return locations;
    }

    findCircularReferences(): CircularReference[] {
        const visited = new Set<string>();
        const recursionStack = new Set<string>();
        const cycles: CircularReference[] = [];

        const dfs = (identifier: string, path: string[] = []): void => {
            if (recursionStack.has(identifier)) {
                const cycleStart = path.indexOf(identifier);
                if (cycleStart !== -1) {
                    const cycle = {
                        path: path.slice(cycleStart),
                        start: identifier
                    };
                    cycles.push(cycle);
                    this.logger.warn('Found circular reference', { cycle });
                }
                return;
            }

            if (visited.has(identifier)) {
                return;
            }

            visited.add(identifier);
            recursionStack.add(identifier);
            path.push(identifier);

            const blocks = this.documents[identifier];
            if (blocks) {
                for (const block of blocks) {
                    for (const dep of block.dependencies) {
                        dfs(dep, [...path]);
                    }
                }
            }

            recursionStack.delete(identifier);
            path.pop();
        };

        for (const identifier of Object.keys(this.documents)) {
            if (!visited.has(identifier)) {
                dfs(identifier);
            }
        }

        return cycles;
    }

    getExpandedContent(identifier: string): string {
        this.logger.debug('Getting expanded content', { identifier });
        
        const blocks = this.documents[identifier];
        if (!blocks?.length) {
            throw new BlockNotFoundError(identifier);
        }

        try {
            const content = this.expand(identifier);
            this.logger.debug('Content expanded successfully', { identifier });
            return content;
        } catch (error) {
            if (error instanceof CircularReferenceError) {
                throw error;
            }
            throw new BlockSyntaxError(
                error instanceof Error ? error.message : String(error),
                identifier
            );
        }
    }

    private expand(id: string, visited: Set<string> = new Set()): string {
        if (visited.has(id)) {
            this.logger.warn('Circular reference detected during expansion', { identifier: id });
            return `<<circular reference to ${id}>>`;
        }

        const blocks = this.documents[id];
        if (!blocks?.length) {
            this.logger.warn('Block not found during expansion', { identifier: id });
            return `<<${id} not found>>`;
        }

        visited.add(id);
        let content = '';
        
        for (const block of blocks) {
            content += block.content.replace(/<<([^>]+)>>/g, (_, ref) => {
                return this.expand(ref, new Set(visited));
            });
            content += '\n';
        }

        visited.delete(id);
        return content;
    }

    clearCache(): void {
        this.documents = {};
        this.fileMap = {};
        this.logger.info('Cache cleared');
    }
}
