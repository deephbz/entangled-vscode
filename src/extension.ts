import * as vscode from 'vscode';
import { LiterateManager } from './core/literate/manager';
import { EntangledDefinitionProvider, EntangledReferenceProvider, EntangledHoverProvider, EntangledDocumentSymbolProvider } from './editor/providers/navigation';
import { DecorationProvider } from './editor/providers/decoration';
import { ExtensionActivator } from './editor/activation';
import { Logger } from './utils/logger';

// Extension Output Channel
const logger = Logger.getInstance();

// Types
type DocumentHandler = (document: vscode.TextDocument) => Promise<void>;

// Document Processing
const isMarkdownDocument = (document: vscode.TextDocument): boolean =>
    document.languageId === 'entangled-markdown';

const handleDocument: DocumentHandler = async (document: vscode.TextDocument): Promise<void> => {
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

// Command Handlers
const createGoToDefinitionHandler = () => async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const definitions = await new EntangledDefinitionProvider().provideDefinition(
        editor.document,
        editor.selection.active,
        new vscode.CancellationTokenSource().token
    );

    if (!definitions) return;
    const location = Array.isArray(definitions) ? definitions[0] : definitions;
    await vscode.window.showTextDocument(location.uri, { selection: location.range });
};

const createFindReferencesHandler = () => async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const references = await new EntangledReferenceProvider().provideReferences(
        editor.document,
        editor.selection.active,
        { includeDeclaration: true },
        new vscode.CancellationTokenSource().token
    );

    if (references?.length) {
        await vscode.commands.executeCommand('editor.action.showReferences',
            editor.document.uri,
            editor.selection.active,
            references
        );
    }
};

// Extension Lifecycle
export function activate(context: vscode.ExtensionContext): void {
    logger.info('Activating Entangled VSCode extension');
    
    const activator = new ExtensionActivator();
    activator.activate(context);

    // Register providers and handlers
    context.subscriptions.push(
        vscode.languages.registerDefinitionProvider({ language: 'entangled-markdown', scheme: 'file' }, new EntangledDefinitionProvider()),
        vscode.languages.registerReferenceProvider({ language: 'entangled-markdown', scheme: 'file' }, new EntangledReferenceProvider()),
        vscode.languages.registerHoverProvider({ language: 'entangled-markdown', scheme: 'file' }, new EntangledHoverProvider()),
        vscode.languages.registerDocumentSymbolProvider({ language: 'entangled-markdown', scheme: 'file' }, new EntangledDocumentSymbolProvider()),
        vscode.workspace.onDidChangeTextDocument(async e => {
            await handleDocument(e.document);
        }),
        vscode.workspace.onDidOpenTextDocument(handleDocument),
        vscode.commands.registerCommand('entangled-vscode.goToDefinition', createGoToDefinitionHandler()),
        vscode.commands.registerCommand('entangled-vscode.findReferences', createFindReferencesHandler()),
        vscode.commands.registerCommand('entangled-vscode.peekReferences', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                return;
            }

            // Execute the built-in references command which will use our reference provider
            await vscode.commands.executeCommand(
                'editor.action.referenceSearch.trigger'
            );
        })
    );

    // Process active document if it exists
    if (vscode.window.activeTextEditor && isMarkdownDocument(vscode.window.activeTextEditor.document)) {
        handleDocument(vscode.window.activeTextEditor.document);
    }

    logger.info('Entangled VSCode extension activated successfully');
}

export function deactivate(): void {
    LiterateManager.getInstance().clearCache();
    logger.dispose();
}

export { logger };
