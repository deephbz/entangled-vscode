import * as vscode from 'vscode';
import { PandocCodeBlock } from '../pandoc/types';
import { DocumentBlock, DocumentMap, FileMap, CircularReference, CodeBlockLocation } from './types';
import { PandocService } from '../pandoc/service';
import { log } from '../extension';

const outputChannel = vscode.window.createOutputChannel('Entangled VSCode');

/**
 * Manages document parsing, code block tracking, and reference resolution for Entangled Markdown files.
 */
export class DocumentManager {
    private static instance: DocumentManager;
    public documents: DocumentMap = {};
    private fileMap: FileMap = {};
    private pandocService: PandocService;

    private constructor() {
        this.pandocService = PandocService.getInstance();
    }

    public static getInstance(): DocumentManager {
        if (!DocumentManager.instance) {
            DocumentManager.instance = new DocumentManager();
        }
        return DocumentManager.instance;
    }

    /**
     * Parses a document and updates the internal document map with code blocks and their relationships.
     * @throws Error if document parsing or AST conversion fails
     */
    async parseDocument(document: vscode.TextDocument): Promise<void> {
        if (!document) {
            throw new Error('Invalid document provided');
        }

        const uri = document.uri.toString();
        log(`Parsing document: ${uri}`);

        try {
            const ast = await this.pandocService.convertToAST(document);
            const blocks = this.pandocService.extractCodeBlocks(ast);
            log(`Found ${blocks.length} code blocks in document`);

            await this.updateDocumentBlocks(uri, document, blocks);
            this.updateDependencies();

            log(`Document parsing completed. Total blocks: ${Object.keys(this.documents).length}`);
            log(`Blocks in current file: ${Array.from(this.fileMap[uri] || []).join(', ')}`);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            log(`Error parsing document: ${errorMessage}`);
            throw error;
        }
    }

    /**
     * Updates document blocks for a given URI, handling existing block cleanup and new block addition.
     */
    private async updateDocumentBlocks(uri: string, document: vscode.TextDocument, blocks: PandocCodeBlock[]): Promise<void> {
        // Clear existing blocks
        this.clearDocumentBlocks(uri);

        // Add new blocks
        for (const block of blocks) {
            const location = this.findBlockLocation(document, block);
            if (!location) {
                log(`Could not find location for block [${block.identifier}]`);
                continue;
            }

            this.addDocumentBlock(uri, block, location);
        }
    }

    /**
     * Clears existing blocks for a given URI from the document map.
     */
    private clearDocumentBlocks(uri: string): void {
        if (!this.fileMap[uri]) {
            this.fileMap[uri] = new Set();
            return;
        }

        for (const identifier of this.fileMap[uri]) {
            this.documents[identifier] = this.documents[identifier]?.filter(
                block => block.location.uri.toString() !== uri
            ) || [];

            if (this.documents[identifier].length === 0) {
                delete this.documents[identifier];
            }
        }
        this.fileMap[uri].clear();
    }

    /**
     * Adds a new document block to the document map.
     */
    private addDocumentBlock(uri: string, block: PandocCodeBlock, location: CodeBlockLocation): void {
        const documentBlock: DocumentBlock = {
            ...block,
            location,
            dependencies: new Set(block.references),
            dependents: new Set()
        };

        if (!this.documents[block.identifier]) {
            this.documents[block.identifier] = [];
        }
        this.documents[block.identifier].push(documentBlock);
        this.fileMap[uri].add(block.identifier);
    }

    /**
     * Finds the location of a code block within a document.
     */
    private findBlockLocation(document: vscode.TextDocument, block: PandocCodeBlock): CodeBlockLocation | null {
        const text = document.getText();
        const lines = text.split('\n');
        let inCodeBlock = false;
        let startLine = -1;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            
            if (line.startsWith('```')) {
                if (!inCodeBlock) {
                    const match = line.match(/^```\s*\{([^}]*)\}/);
                    if (match?.length) {
                        const attributes = match[1];
                        const idMatch = attributes.match(/#([^\s}]+)/);
                        if (idMatch?.[1] === block.identifier) {
                            startLine = i;
                            inCodeBlock = true;
                        }
                    }
                } else if (startLine !== -1) {
                    return {
                        uri: document.uri,
                        range: new vscode.Range(
                            new vscode.Position(startLine, 0),
                            new vscode.Position(i, lines[i].length)
                        ),
                        identifier: block.identifier
                    };
                }
                inCodeBlock = !inCodeBlock;
            }
        }
        return null;
    }

    private updateDependencies(): void {
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
        if (!identifier) return [];
        
        const blocks = this.documents[identifier];
        if (!blocks) return [];
        
        return blocks.map(block => new vscode.Location(
            block.location.uri,
            block.location.range
        ));
    }

    findReferences(identifier: string): vscode.Location[] {
        if (!identifier) return [];

        const locations: vscode.Location[] = [];
        const blocks = this.documents[identifier];
        
        // Add definitions
        if (blocks) {
            locations.push(...blocks.map(block => 
                new vscode.Location(block.location.uri, block.location.range)
            ));
        }

        // Add references from other blocks
        for (const blockList of Object.values(this.documents)) {
            for (const block of blockList) {
                if (block.dependencies.has(identifier)) {
                    this.addReferenceLocation(block, identifier, locations);
                }
            }
        }

        return locations;
    }

    private addReferenceLocation(block: DocumentBlock, identifier: string, locations: vscode.Location[]): void {
        const reference = `<<${identifier}>>`;
        const index = block.content.indexOf(reference);
        
        if (index !== -1) {
            const position = block.location.range.start.translate(0, index);
            const range = new vscode.Range(
                position,
                position.translate(0, reference.length)
            );
            locations.push(new vscode.Location(block.location.uri, range));
        }
    }

    findCircularReferences(): CircularReference[] {
        const circular: CircularReference[] = [];
        const visited = new Set<string>();
        const path: string[] = [];

        for (const identifier of Object.keys(this.documents)) {
            this.dfs(identifier, visited, path, circular);
        }

        return circular;
    }

    private dfs(
        identifier: string,
        visited: Set<string>,
        path: string[],
        circular: CircularReference[]
    ): void {
        if (path.includes(identifier)) {
            const start = path.indexOf(identifier);
            circular.push({
                path: path.slice(start),
                start: identifier
            });
            return;
        }

        if (visited.has(identifier)) return;
        
        visited.add(identifier);
        path.push(identifier);

        const block = this.documents[identifier]?.[0];
        if (block) {
            for (const dep of block.dependencies) {
                this.dfs(dep, visited, path, circular);
            }
        }

        path.pop();
        visited.delete(identifier);
    }

    getExpandedContent(identifier: string): string {
        if (!identifier) return '';

        const blocks = this.documents[identifier];
        if (!blocks?.length) return '';

        const block = blocks[0];
        if (block.expandedContent !== undefined) {
            return block.expandedContent;
        }

        const visited = new Set<string>();
        block.expandedContent = this.expand(identifier, visited);
        return block.expandedContent;
    }

    private expand(id: string, visited: Set<string>): string {
        if (visited.has(id)) {
            return `<<${id}>> (circular reference)`;
        }
        visited.add(id);

        const currentBlocks = this.documents[id];
        if (!currentBlocks?.length) {
            return `<<${id}>> (undefined)`;
        }

        let content = currentBlocks[0].content;
        for (const ref of currentBlocks[0].dependencies) {
            const refContent = this.expand(ref, visited);
            content = content.replace(new RegExp(`<<${ref}>>`, 'g'), refContent);
        }

        visited.delete(id);
        return content;
    }

    clearCache(): void {
        this.documents = {};
        this.fileMap = {};
    }
}
