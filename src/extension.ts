import * as vscode from 'vscode';
import { DocumentManager } from './document/manager';
import {
    EntangledDefinitionProvider,
    EntangledReferenceProvider,
    EntangledHoverProvider,
    EntangledDocumentSymbolProvider
} from './navigation/providers';

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
    ['markdown', 'entangled-markdown'].includes(document.languageId);

const handleDocument: DocumentHandler = async (document: vscode.TextDocument) => {
    if (document.uri.scheme === 'output' || !isMarkdownDocument(document)) {
        return;
    }

    try {
        log(`Processing document: ${document.uri}`);
        await DocumentManager.getInstance().parseDocument(document);
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
    
    const selector: vscode.DocumentSelector = [
        { language: 'markdown', scheme: 'file' },
        { language: 'entangled-markdown', scheme: 'file' }
    ];

    // Register providers and handlers
    context.subscriptions.push(
        outputChannel,
        vscode.languages.registerDefinitionProvider(selector, new EntangledDefinitionProvider()),
        vscode.languages.registerReferenceProvider(selector, new EntangledReferenceProvider()),
        vscode.languages.registerHoverProvider(selector, new EntangledHoverProvider()),
        vscode.languages.registerDocumentSymbolProvider(selector, new EntangledDocumentSymbolProvider()),
        vscode.workspace.onDidChangeTextDocument(e => handleDocument(e.document)),
        vscode.workspace.onDidOpenTextDocument(handleDocument),
        vscode.commands.registerCommand('entangled-vscode.goToDefinition', createGoToDefinitionHandler()),
        vscode.commands.registerCommand('entangled-vscode.findReferences', createFindReferencesHandler())
    );

    // Process active document if it exists
    if (vscode.window.activeTextEditor) {
        handleDocument(vscode.window.activeTextEditor.document);
    }

    log('Entangled VSCode extension activated successfully');
}

export function deactivate(): void {
    DocumentManager.getInstance().clearCache();
}

export { outputChannel, log };
