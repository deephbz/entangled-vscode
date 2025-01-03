// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { DocumentManager } from './document/manager';
import {
    EntangledDefinitionProvider,
    EntangledReferenceProvider,
    EntangledHoverProvider,
    EntangledDocumentSymbolProvider
} from './navigation/providers';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
    const documentManager = DocumentManager.getInstance();
    const selector = { language: 'markdown', scheme: 'file' };

    // Register providers
    context.subscriptions.push(
        vscode.languages.registerDefinitionProvider(selector, new EntangledDefinitionProvider()),
        vscode.languages.registerReferenceProvider(selector, new EntangledReferenceProvider()),
        vscode.languages.registerHoverProvider(selector, new EntangledHoverProvider()),
        vscode.languages.registerDocumentSymbolProvider(selector, new EntangledDocumentSymbolProvider())
    );

    // Watch for document changes
    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument(async (e) => {
            if (e.document.languageId === 'markdown') {
                await documentManager.parseDocument(e.document);
            }
        }),
        vscode.workspace.onDidOpenTextDocument(async (document) => {
            if (document.languageId === 'markdown') {
                await documentManager.parseDocument(document);
            }
        })
    );

    // Parse all currently open markdown documents
    vscode.workspace.textDocuments.forEach(async (document) => {
        if (document.languageId === 'markdown') {
            await documentManager.parseDocument(document);
        }
    });

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('entangled-vscode.goToDefinition', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) return;

            const position = editor.selection.active;
            const provider = new EntangledDefinitionProvider();
            const definitions = await provider.provideDefinition(editor.document, position, new vscode.CancellationTokenSource().token);
            
            if (definitions && definitions.length > 0) {
                await vscode.window.showTextDocument(definitions[0].uri, {
                    selection: definitions[0].range
                });
            }
        }),
        vscode.commands.registerCommand('entangled-vscode.findReferences', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) return;

            const position = editor.selection.active;
            const provider = new EntangledReferenceProvider();
            const references = await provider.provideReferences(
                editor.document,
                position,
                { includeDeclaration: true },
                new vscode.CancellationTokenSource().token
            );

            if (references && references.length > 0) {
                await vscode.commands.executeCommand('editor.action.showReferences',
                    editor.document.uri,
                    position,
                    references
                );
            }
        })
    );
}

// This method is called when your extension is deactivated
export function deactivate() {
    // Clean up if needed
    const documentManager = DocumentManager.getInstance();
    documentManager.clearCache();
}
