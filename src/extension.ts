import * as vscode from 'vscode';
import { LiterateManager } from './core/literate/manager';
import { EntangledDefinitionProvider, EntangledReferenceProvider, EntangledHoverProvider, EntangledDocumentSymbolProvider } from './editor/providers/navigation';
import { DecorationProvider } from './editor/providers/decoration';
import { ExtensionActivator } from './editor/activation';
import { Logger } from './utils/logger';

// Extension Output Channel
const logger = Logger.getInstance();

// Document Processing
const isMarkdownDocument = (document: vscode.TextDocument): boolean =>
    document.languageId === 'entangled-markdown';

const handleDocument = async (document: vscode.TextDocument): Promise<void> => {
    if (document.uri.scheme === 'output' || !isMarkdownDocument(document)) {
        return;
    }

    try {
        logger.info(`Processing document: ${document.uri}`);
        await LiterateManager.getInstance().parseDocument(document);
        
        // Update decorations after document is processed
        const editor = vscode.window.visibleTextEditors.find(e => e.document === document);
        if (editor) {
            DecorationProvider.getInstance().triggerUpdateDecorations();
        }
    } catch (error) {
        logger.error(`Error processing document`, error instanceof Error ? error : new Error(String(error)));
    }
};

// Extension Lifecycle
export function activate(context: vscode.ExtensionContext): void {
    logger.info('Activating Entangled VSCode extension');
    
    const activator = new ExtensionActivator();
    activator.activate(context);

    // Register providers
    context.subscriptions.push(
        vscode.languages.registerDefinitionProvider(
            { language: 'entangled-markdown', scheme: 'file' },
            new EntangledDefinitionProvider()
        ),
        vscode.languages.registerReferenceProvider(
            { language: 'entangled-markdown', scheme: 'file' },
            new EntangledReferenceProvider()
        ),
        vscode.languages.registerHoverProvider(
            { language: 'entangled-markdown', scheme: 'file' },
            new EntangledHoverProvider()
        ),
        vscode.languages.registerDocumentSymbolProvider(
            { language: 'entangled-markdown', scheme: 'file' },
            new EntangledDocumentSymbolProvider()
        ),
        vscode.workspace.onDidChangeTextDocument(e => handleDocument(e.document)),
        vscode.workspace.onDidOpenTextDocument(handleDocument)
    );
}

export function deactivate(): void {
    logger.info('Deactivating Entangled VSCode extension');
}

export { logger };
