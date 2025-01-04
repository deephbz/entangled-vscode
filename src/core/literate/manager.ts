import * as vscode from 'vscode';
import { Logger } from '../../utils/logger';
import { DocumentMap, FileMap, DocumentBlock, CircularReference } from './entities';
import { ILiterateParser, LiterateParser } from './parser';
import { BlockNotFoundError, CircularDependencyError } from '../../utils/errors';

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
        this.logger.info('Parsing document', { uri });
        
        try {
            const blocks = await this.extractCodeBlocks(document);
            
            // Clear existing blocks for this document
            this.clearDocumentBlocks(uri);
            
            // Process and add new blocks
            const processedBlocks = this.parser.parseDocument(document, blocks);
            this.addDocumentBlocks(uri, processedBlocks);

            // Update dependencies
            this.updateDependencies();
            
            this.logger.info('Document parsing completed', {
                totalBlocks: Object.keys(this.documents).length,
                fileBlocks: Array.from(this.fileMap[uri] || [])
            });
        } catch (error) {
            this.logger.error('Failed to parse document', error instanceof Error ? error : new Error(String(error)), { uri });
            throw error;
        }
    }

    private async extractCodeBlocks(_: vscode.TextDocument): Promise<DocumentBlock[]> {
        // This is a placeholder. The actual implementation will need to use Pandoc service
        // which will be injected or implemented separately
        return [];
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
        const blocks = this.documents[identifier];
        if (!blocks?.length) {
            throw new BlockNotFoundError(identifier);
        }

        const cycles = this.findCircularReferences();
        if (cycles.length > 0) {
            throw new CircularDependencyError(cycles[0].path);
        }

        return this.expand(identifier);
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
