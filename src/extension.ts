import * as vscode from 'vscode';
import { LiterateManager } from './core/literate/manager';
import { EntangledDefinitionProvider, EntangledReferenceProvider, EntangledHoverProvider, EntangledDocumentSymbolProvider } from './editor/providers/navigation';
import { DecorationProvider } from './editor/providers/decoration';
import { ExtensionActivator } from './editor/activation';
import { Logger } from './utils/logger';
import { PandocError } from './utils/errors';
import { ParseError } from './utils/errors';

// Extension Output Channel
const logger = Logger.getInstance();

// Document Processing
const isMarkdownDocument = (document: vscode.TextDocument): boolean =>
    document.languageId === 'entangled-markdown';

const handleDocument = async (document: vscode.TextDocument): Promise<void> => {
    // Early exit checks with debug logs
    if (document.uri.scheme === 'output') {
        logger.debug('Skipping output document', { uri: document.uri.toString() });
        return;
    }
    
    if (!isMarkdownDocument(document)) {
        logger.debug('Skipping non-markdown document', { 
            uri: document.uri.toString(),
            languageId: document.languageId 
        });
        return;
    }

    try {
        logger.debug('Starting document processing', {
            uri: document.uri.toString(),
            size: document.getText().length
        });

        // Parse document
        await LiterateManager.getInstance().parseDocument(document);
        
        // Update decorations
        const editor = vscode.window.visibleTextEditors.find(e => e.document === document);
        if (editor) {
            DecorationProvider.getInstance().triggerUpdateDecorations();
            logger.debug('Decorations updated');
        }

        logger.debug('Document processed successfully');
    } catch (error) {
        if (error instanceof PandocError) {
            logger.error('Pandoc processing failed', error, {
                uri: document.uri.toString()
            });
            vscode.window.showErrorMessage('Failed to process document: Pandoc error');
        } else if (error instanceof ParseError) {
            logger.error('Document parsing failed', error, {
                uri: document.uri.toString()
            });
            vscode.window.showErrorMessage('Failed to process document: Parse error');
        } else {
            logger.error('Unknown error during document processing', 
                error instanceof Error ? error : new Error(String(error)),
                { uri: document.uri.toString() }
            );
        }
    }
};

// Extension Lifecycle
export function activate(context: vscode.ExtensionContext): void {
    logger.info('Activating EntangleD extension', {
        workspace: vscode.workspace.name,
        extensionMode: context.extensionMode
    });
    
    try {
        const activator = new ExtensionActivator();
        activator.activate(context);

        // Register document listeners
        context.subscriptions.push(
            vscode.workspace.onDidOpenTextDocument(handleDocument),
            vscode.workspace.onDidChangeTextDocument(e => handleDocument(e.document)),
            vscode.workspace.onDidSaveTextDocument(handleDocument)
        );

        // Process any already open text editors
        vscode.workspace.textDocuments.forEach(handleDocument);

        logger.info('Extension activated successfully');
    } catch (error) {
        logger.error('Failed to activate extension', error instanceof Error ? error : new Error(String(error)));
        vscode.window.showErrorMessage('Failed to activate EntangleD extension');
    }
}

export function deactivate(): void {
    logger.info('Deactivating EntangleD extension');
}

export { logger };
