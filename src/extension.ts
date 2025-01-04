import * as vscode from 'vscode';
import { LiterateManager } from './core/literate/manager';
import { EntangledDefinitionProvider, EntangledReferenceProvider, EntangledHoverProvider, EntangledDocumentSymbolProvider } from './editor/providers/navigation';
import { DecorationProvider } from './editor/providers/decoration';

// Types
type DocumentHandler = (document: vscode.TextDocument) => Promise<void>;

// Extension Output Channel
const outputChannel = vscode.window.createOutputChannel('Entangled VSCode');
const log = (message: string, error?: Error): void => {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}`;
    console.log(logMessage);
    outputChannel.appendLine(logMessage);
    if (error?.stack) {
        outputChannel.appendLine(`Stack trace:\n${error.stack}`);
    }
};

// Document Processing
const isMarkdownDocument = (document: vscode.TextDocument): boolean =>
    document.languageId === 'entangled-markdown';

const handleDocument: DocumentHandler = async (document: vscode.TextDocument) => {
    if (document.uri.scheme === 'output' || !isMarkdownDocument(document)) {
        return;
    }

    try {
        log(`Processing document: ${document.uri}`);
        await LiterateManager.getInstance().parseDocument(document);
        
        // Update decorations after document is processed
        const editor = vscode.window.visibleTextEditors.find(e => e.document === document);
        if (editor) {
            DecorationProvider.getInstance().updateDecorations(editor);
        }
    } catch (error) {
        log(`Error processing document: ${error instanceof Error ? error.message : String(error)}`, 
            error instanceof Error ? error : undefined);
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
    log('Activating Entangled VSCode extension');
    
    const decorationProvider = DecorationProvider.getInstance();
    const selector: vscode.DocumentSelector = { language: 'entangled-markdown', scheme: 'file' };

    // Register providers and handlers
    context.subscriptions.push(
        outputChannel,
        vscode.languages.registerDefinitionProvider(selector, new EntangledDefinitionProvider()),
        vscode.languages.registerReferenceProvider(selector, new EntangledReferenceProvider()),
        vscode.languages.registerHoverProvider(selector, new EntangledHoverProvider()),
        vscode.languages.registerDocumentSymbolProvider(selector, new EntangledDocumentSymbolProvider()),
        vscode.workspace.onDidChangeTextDocument(async e => {
            await handleDocument(e.document);
        }),
        vscode.workspace.onDidOpenTextDocument(handleDocument),
        vscode.commands.registerCommand('entangled-vscode.goToDefinition', createGoToDefinitionHandler()),
        vscode.commands.registerCommand('entangled-vscode.findReferences', createFindReferencesHandler()),
        vscode.languages.registerReferenceProvider(
            { language: 'entangled-markdown' },
            new EntangledReferenceProvider()
        ),
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

    // Update decorations when active editor changes
    vscode.window.onDidChangeActiveTextEditor(async editor => {
        if (editor && isMarkdownDocument(editor.document)) {
            await handleDocument(editor.document);
        }
    }, null, context.subscriptions);

    // Update decorations when document changes
    vscode.workspace.onDidChangeTextDocument(event => {
        const editor = vscode.window.activeTextEditor;
        if (editor && event.document === editor.document) {
            decorationProvider.updateDecorations(editor);
        }
    }, null, context.subscriptions);

    // Initial decoration for active editor
    if (vscode.window.activeTextEditor) {
        decorationProvider.updateDecorations(vscode.window.activeTextEditor);
    }

    // Process active document if it exists
    if (vscode.window.activeTextEditor && isMarkdownDocument(vscode.window.activeTextEditor.document)) {
        handleDocument(vscode.window.activeTextEditor.document);
    }

    log('Entangled VSCode extension activated successfully');
}

export function deactivate(): void {
    LiterateManager.getInstance().clearCache();
}

export { outputChannel, log };
