import * as vscode from 'vscode';
import { CodeBlock, CircularReference } from '../core/types';
import { PandocService } from '../pandoc/service';
import { log } from '../extension';

const outputChannel = vscode.window.createOutputChannel('Entangled VSCode');

interface MutableCodeBlock extends CodeBlock {
    dependencies: Set<string>;
    dependents: Set<string>;
    expandedContent?: string;
}

export class DocumentManager {
    private static instance: DocumentManager;
    public documents: { [key: string]: MutableCodeBlock[] } = {};
    private fileMap: { [key: string]: Set<string> } = {};
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
                    log(`Found location for block [${block.identifier}]`);
                    const documentBlock: MutableCodeBlock = {
                        ...block,
                        location,
                        dependencies: new Set(block.references),
                        dependents: new Set()
                    };

                    // Add to documents map
                    if (!this.documents[block.identifier]) {
                        this.documents[block.identifier] = [];
                    }
                    this.documents[block.identifier].push(documentBlock);

                    // Add to file map
                    this.fileMap[uri].add(block.identifier);
                } else {
                    log(`Could not find location for block [${block.identifier}]`);
                }
            }

            // Update dependencies
            this.updateDependencies();
            
            log('Document parsing completed');
            log(`Blocks in current file: ${Array.from(this.fileMap[uri] || []).join(', ')}`);
        } catch (error) {
            log(`Error parsing document: ${error}`);
            if (error instanceof Error) {
                log(`Error stack: ${error.stack}`);
            }
            throw error;
        }
    }

    private updateDependencies(): void {
        // Clear all dependents
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

    findDefinition(identifier: string): vscode.Location | undefined {
        const blocks = this.documents[identifier];
        return blocks?.[0]?.location;
    }

    findReferences(identifier: string): vscode.Location[] {
        const locations: vscode.Location[] = [];
        
        // Add definitions
        const blocks = this.documents[identifier];
        if (blocks) {
            locations.push(...blocks.map(block => block.location));
        }

        // Add references
        for (const allBlocks of Object.values(this.documents)) {
            for (const block of allBlocks) {
                if (block.dependencies.has(identifier)) {
                    locations.push(block.location);
                }
            }
        }

        return locations;
    }

    detectCircularReferences(): CircularReference[] {
        const circularRefs: CircularReference[] = [];
        const visited = new Set<string>();
        const path: string[] = [];

        const visit = (identifier: string) => {
            if (path.includes(identifier)) {
                const start = identifier;
                const cycle = path.slice(path.indexOf(identifier));
                circularRefs.push({ path: cycle, start });
                return;
            }

            if (visited.has(identifier)) {
                return;
            }

            visited.add(identifier);
            path.push(identifier);

            const blocks = this.documents[identifier];
            if (blocks) {
                for (const block of blocks) {
                    for (const dep of block.dependencies) {
                        visit(dep);
                    }
                }
            }

            path.pop();
        };

        for (const identifier of Object.keys(this.documents)) {
            visit(identifier);
        }

        return circularRefs;
    }

    getExpandedContent(identifier: string): string {
        const blocks = this.documents[identifier];
        if (!blocks || blocks.length === 0) {
            return '';
        }

        // Use the first block's content
        const block = blocks[0];
        return block.content;
    }

    private findBlockLocation(document: vscode.TextDocument, block: CodeBlock): vscode.Location | undefined {
        const text = document.getText();
        const lines = text.split('\n');
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            // Match code block start
            if (line.trim().startsWith('```')) {
                // Check if this is our block by matching attributes
                const attrs = line.substring(3).trim();
                if (this.matchesBlockAttributes(attrs, block)) {
                    // Find block end
                    let endLine = i + 1;
                    while (endLine < lines.length && !lines[endLine].trim().startsWith('```')) {
                        endLine++;
                    }
                    
                    return new vscode.Location(
                        document.uri,
                        new vscode.Range(
                            new vscode.Position(i, 0),
                            new vscode.Position(endLine, lines[endLine]?.length || 0)
                        )
                    );
                }
            }
        }
        
        return undefined;
    }

    private matchesBlockAttributes(attrs: string, block: CodeBlock): boolean {
        // Match language and identifier/file attributes
        if (block.type === 'file') {
            return attrs.includes(`.${block.language}`) && 
                   attrs.includes(`file=${block.fileName}`);
        } else if (block.type === 'referable') {
            return attrs.includes(`.${block.language}`) && 
                   attrs.includes(`#${block.identifier}`);
        }
        return false;
    }

    clearCache(): void {
        this.documents = {};
        this.fileMap = {};
    }
}
