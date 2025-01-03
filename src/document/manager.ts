import * as vscode from 'vscode';
import { PandocCodeBlock } from '../pandoc/types';
import { DocumentBlock, DocumentMap, FileMap, CircularReference, CodeBlockLocation } from './types';
import { PandocService } from '../pandoc/service';
import { log } from '../extension';

// Get the output channel from extension
const outputChannel = vscode.window.createOutputChannel('Entangled VSCode');

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

    async parseDocument(document: vscode.TextDocument): Promise<void> {
        log(`Parsing document: ${document.uri}`);
        try {
            log('Converting document to AST...');
            const ast = await this.pandocService.convertToAST(document);
            log('AST conversion successful, extracting code blocks...');
            const blocks = this.pandocService.extractCodeBlocks(ast);
            log(`Found ${blocks.length} code blocks in document`);
            
            // Clear existing blocks for this document
            const uri = document.uri.toString();
            if (this.fileMap[uri]) {
                log(`Clearing existing blocks for ${uri}`);
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

            // Add new blocks
            for (const block of blocks) {
                const location = this.findBlockLocation(document, block);
                if (location) {
                    log(`Found location for block ${block.identifier}`);
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
                    log(`Added block ${block.identifier} to documents`);
                } else {
                    log(`Could not find location for block ${block.identifier}`);
                }
            }

            // Update dependencies
            this.updateDependencies();
            log(`Document parsing completed. Total blocks: ${Object.keys(this.documents).length}`);
            log(`Blocks in current file: ${Array.from(this.fileMap[uri] || []).join(', ')}`);
        } catch (error) {
            log(`Error parsing document: ${error}`);
            if (error instanceof Error) {
                log(`Error stack: ${error.stack}`);
            }
            throw error;
        }
    }

    private findBlockLocation(document: vscode.TextDocument, block: PandocCodeBlock): CodeBlockLocation | null {
        log(`Finding location for block: ${block.identifier}`);
        const text = document.getText();
        const lines = text.split('\n');
        let inCodeBlock = false;
        let startLine = -1;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            log(`Checking line ${i}: ${line}`);
            
            if (line.startsWith('```')) {
                if (!inCodeBlock) {
                    // Check for both formats: {.lang #id} and {#id .lang}
                    const match = line.match(/^```\s*\{([^}]*)\}/);
                    if (match) {
                        const attributes = match[1];
                        log(`Found code block start with attributes: ${attributes}`);
                        // Look for #identifier in attributes
                        const idMatch = attributes.match(/#([^\s}]+)/);
                        if (idMatch && idMatch[1] === block.identifier) {
                            log(`Found matching block: ${block.identifier}`);
                            startLine = i;
                            inCodeBlock = true;
                        }
                    }
                } else {
                    if (startLine !== -1) {
                        // We found the end of our block
                        log(`Found end of block ${block.identifier} at line ${i}`);
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
        log(`No location found for block: ${block.identifier}`);
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
        const blocks = this.documents[identifier];
        if (!blocks) return [];
        
        return blocks.map(block => new vscode.Location(
            block.location.uri,
            block.location.range
        ));
    }

    findReferences(identifier: string): vscode.Location[] {
        const locations: vscode.Location[] = [];
        
        // Add definitions
        const blocks = this.documents[identifier];
        if (blocks) {
            locations.push(...blocks.map(block => 
                new vscode.Location(block.location.uri, block.location.range)
            ));
        }

        // Add references from other blocks
        for (const [_, blockList] of Object.entries(this.documents)) {
            for (const block of blockList) {
                if (block.dependencies.has(identifier)) {
                    // Find the exact position of the reference in the block
                    const reference = `<<${identifier}>>`;
                    const content = block.content;
                    const index = content.indexOf(reference);
                    if (index !== -1) {
                        const position = block.location.range.start.translate(0, index);
                        const range = new vscode.Range(
                            position,
                            position.translate(0, reference.length)
                        );
                        locations.push(new vscode.Location(block.location.uri, range));
                    }
                }
            }
        }

        return locations;
    }

    findCircularReferences(): CircularReference[] {
        const circular: CircularReference[] = [];
        const visited = new Set<string>();
        const path: string[] = [];

        const dfs = (identifier: string) => {
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
                    dfs(dep);
                }
            }

            path.pop();
        };

        for (const identifier of Object.keys(this.documents)) {
            dfs(identifier);
        }

        return circular;
    }

    getExpandedContent(identifier: string): string {
        const blocks = this.documents[identifier];
        if (!blocks || blocks.length === 0) return '';

        const block = blocks[0];
        if (block.expandedContent !== undefined) {
            return block.expandedContent;
        }

        const visited = new Set<string>();
        const expand = (id: string): string => {
            if (visited.has(id)) return `<<${id}>> (circular reference)`;
            visited.add(id);

            const currentBlocks = this.documents[id];
            if (!currentBlocks || currentBlocks.length === 0) {
                return `<<${id}>> (undefined)`;
            }

            let content = currentBlocks[0].content;
            for (const ref of currentBlocks[0].dependencies) {
                const refContent = expand(ref);
                content = content.replace(new RegExp(`<<${ref}>>`, 'g'), refContent);
            }

            visited.delete(id);
            return content;
        };

        block.expandedContent = expand(identifier);
        return block.expandedContent;
    }

    clearCache(): void {
        this.documents = {};
        this.fileMap = {};
    }
}
