import * as vscode from 'vscode';
import { PandocService } from '../pandoc/service';
import { CodeBlock, DocumentProcessor, ParsedDocument } from './types';
import { log } from '../extension';

export class EntangledProcessor implements DocumentProcessor {
    private static instance: EntangledProcessor;
    private pandocService: PandocService;
    private documentCache: Map<string, ParsedDocument>;

    private constructor() {
        this.pandocService = PandocService.getInstance();
        this.documentCache = new Map();
    }

    public static getInstance(): EntangledProcessor {
        if (!EntangledProcessor.instance) {
            EntangledProcessor.instance = new EntangledProcessor();
        }
        return EntangledProcessor.instance;
    }

    async parse(document: vscode.TextDocument): Promise<ParsedDocument> {
        log(`Parsing document: ${document.uri}`);
        
        // Convert document to AST and extract code blocks
        const ast = await this.pandocService.convertToAST(document);
        const blocks = await this.pandocService.extractCodeBlocks(ast);
        
        // Process blocks and build references
        const references = new Map<string, CodeBlock[]>();
        const fileBlocks = new Map<string, CodeBlock>();
        
        // Find locations and build maps
        for (const block of blocks) {
            // Find block location in document
            const location = await this.findBlockLocation(document, block);
            if (location) {
                const codeBlock: CodeBlock = {
                    ...block,
                    location
                };
                
                // Add to appropriate collections
                if (block.type === 'referable' && block.identifier) {
                    const refBlocks = references.get(block.identifier) || [];
                    refBlocks.push(codeBlock);
                    references.set(block.identifier, refBlocks);
                } else if (block.type === 'file' && block.fileName) {
                    fileBlocks.set(block.fileName, codeBlock);
                }
            }
        }
        
        const parsedDoc: ParsedDocument = {
            uri: document.uri.toString(),
            blocks,
            references,
            fileBlocks,
            version: document.version
        };
        
        // Update cache
        this.documentCache.set(document.uri.toString(), parsedDoc);
        
        return parsedDoc;
    }

    async getParsedDocument(uri: string): Promise<ParsedDocument | undefined> {
        return this.documentCache.get(uri);
    }

    invalidate(uri: string): void {
        this.documentCache.delete(uri);
    }

    clearCache(): void {
        this.documentCache.clear();
    }

    private async findBlockLocation(
        document: vscode.TextDocument,
        block: CodeBlock
    ): Promise<vscode.Location | undefined> {
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
}
