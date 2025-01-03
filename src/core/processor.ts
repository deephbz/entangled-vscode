import * as vscode from 'vscode';
import { PandocService } from '../pandoc/service';
import { CodeBlock, DocumentProcessor, ParsedDocument, ProcessingError } from './types';
import { log } from '../extension';

export class EntangledProcessor implements DocumentProcessor {
    private static instance: EntangledProcessor;
    private pandocService: PandocService;
    private documentCache: Map<string, ParsedDocument>;
    private processingQueue: Map<string, Promise<ParsedDocument>>;

    private constructor() {
        this.pandocService = PandocService.getInstance();
        this.documentCache = new Map();
        this.processingQueue = new Map();
    }

    public static getInstance(): EntangledProcessor {
        if (!EntangledProcessor.instance) {
            EntangledProcessor.instance = new EntangledProcessor();
        }
        return EntangledProcessor.instance;
    }

    async parse(document: vscode.TextDocument): Promise<ParsedDocument> {
        const uri = document.uri.toString();
        
        // Check if document is already being processed
        const existingPromise = this.processingQueue.get(uri);
        if (existingPromise) {
            return existingPromise;
        }

        // Create new processing promise
        const processingPromise = this.processDocument(document);
        this.processingQueue.set(uri, processingPromise);

        try {
            const result = await processingPromise;
            return result;
        } finally {
            this.processingQueue.delete(uri);
        }
    }

    private async processDocument(document: vscode.TextDocument): Promise<ParsedDocument> {
        try {
            log(`Processing document: ${document.uri}`);
            
            // Convert document to AST and extract code blocks
            const ast = await this.pandocService.convertToAST(document);
            const blocks = await this.pandocService.extractCodeBlocks(ast);
            
            // Process blocks and build references
            const references = new Map<string, CodeBlock[]>();
            const fileBlocks = new Map<string, CodeBlock>();
            const processedBlocks: CodeBlock[] = [];
            
            // Find locations and build maps
            for (const block of blocks) {
                const location = await this.findBlockLocation(document, block);
                if (!location) {
                    log(`Warning: Could not find location for block ${block.identifier || block.fileName}`);
                    continue;
                }

                const codeBlock: CodeBlock = { ...block, location };
                processedBlocks.push(codeBlock);

                if (block.type === 'referable' && block.identifier) {
                    const refBlocks = references.get(block.identifier) || [];
                    refBlocks.push(codeBlock);
                    references.set(block.identifier, refBlocks);
                } else if (block.type === 'file' && block.fileName) {
                    fileBlocks.set(block.fileName, codeBlock);
                }
            }

            const parsedDoc: ParsedDocument = {
                uri: document.uri.toString(),
                blocks: processedBlocks,
                references,
                fileBlocks,
                lastModified: Date.now()
            };

            // Update cache
            this.documentCache.set(document.uri.toString(), parsedDoc);
            log(`Successfully processed document with ${blocks.length} blocks`);
            
            return parsedDoc;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new ProcessingError(`Failed to process document: ${message}`, error instanceof Error ? error : undefined);
        }
    }

    private async findBlockLocation(document: vscode.TextDocument, block: CodeBlock): Promise<vscode.Location | undefined> {
        const text = document.getText();
        const lines = text.split('\n');
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (line.trim().startsWith('```')) {
                // Check for block identifier or file name
                const nextLine = lines[i + 1];
                if (!nextLine) continue;

                const matchesBlock = block.type === 'referable' && block.identifier ?
                    nextLine.includes(`#${block.identifier}`) :
                    block.type === 'file' && block.fileName && nextLine.includes(`file=${block.fileName}`);

                if (matchesBlock) {
                    // Find the end of the code block
                    let endLine = i + 2;
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

    async getParsedDocument(uri: string): Promise<ParsedDocument | undefined> {
        return this.documentCache.get(uri);
    }

    invalidate(uri: string): void {
        this.documentCache.delete(uri);
    }

    findReferences(uri: string, identifier: string): CodeBlock[] {
        const doc = this.documentCache.get(uri);
        if (!doc) return [];
        return Array.from(doc.references.get(identifier) || []);
    }

    findDefinition(uri: string, identifier: string): CodeBlock | undefined {
        const doc = this.documentCache.get(uri);
        if (!doc) return undefined;
        const blocks = doc.references.get(identifier);
        return blocks?.[0];
    }
}
