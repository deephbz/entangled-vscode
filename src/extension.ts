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

// Create a single shared output channel
export const outputChannel = vscode.window.createOutputChannel('Entangled VSCode');

export function log(message: string) {
    console.log(message);
    outputChannel.appendLine(`[${new Date().toISOString()}] ${message}`);
    outputChannel.show(true);  // Make sure the output is visible
}

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
    log('Activating Entangled VSCode extension');
    
    const documentManager = DocumentManager.getInstance();
    
    // Add output channel to subscriptions
    context.subscriptions.push(outputChannel);

    // Register for both markdown and entangled-markdown files
    const selector = [
        { language: 'markdown', scheme: 'file' },
        { language: 'entangled-markdown', scheme: 'file' }
    ];
    log(`Registering language providers for selectors: ${JSON.stringify(selector)}`);

    // Register providers
    log('Registering language providers...');
    context.subscriptions.push(
        vscode.languages.registerDefinitionProvider(selector, new EntangledDefinitionProvider()),
        vscode.languages.registerReferenceProvider(selector, new EntangledReferenceProvider()),
        vscode.languages.registerHoverProvider(selector, new EntangledHoverProvider()),
        vscode.languages.registerDocumentSymbolProvider(selector, new EntangledDocumentSymbolProvider())
    );

    // Watch for document changes
    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument(async (e) => {
            // Skip output channel documents
            if (e.document.uri.scheme === 'output') {
                return;
            }
            
            log(`Document changed: ${e.document.uri} (language: ${e.document.languageId})`);
            if (e.document.languageId === 'markdown' || e.document.languageId === 'entangled-markdown') {
                log('Processing markdown document change');
                try {
                    await documentManager.parseDocument(e.document);
                } catch (error) {
                    log(`Error processing document change: ${error}`);
                    if (error instanceof Error) {
                        log(`Error stack: ${error.stack}`);
                    }
                }
            } else {
                log(`Skipping non-markdown document: ${e.document.languageId}`);
            }
        }),
        vscode.workspace.onDidOpenTextDocument(async (document) => {
            // Skip output channel documents
            if (document.uri.scheme === 'output') {
                return;
            }
            
            log(`Document opened: ${document.uri} (language: ${document.languageId})`);
            if (document.languageId === 'markdown' || document.languageId === 'entangled-markdown') {
                log('Processing opened markdown document');
                try {
                    await documentManager.parseDocument(document);
                } catch (error) {
                    log(`Error processing opened document: ${error}`);
                    if (error instanceof Error) {
                        log(`Error stack: ${error.stack}`);
                    }
                }
            } else {
                log(`Skipping non-markdown document: ${document.languageId}`);
            }
        })
    );

    // Process currently active document if it's markdown
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor) {
        log(`Active editor document: ${activeEditor.document.uri} (language: ${activeEditor.document.languageId})`);
        if (activeEditor.document.languageId === 'markdown' || activeEditor.document.languageId === 'entangled-markdown') {
            log('Processing active document');
            documentManager.parseDocument(activeEditor.document).catch(error => {
                log(`Error processing active document: ${error}`);
                if (error instanceof Error) {
                    log(`Error stack: ${error.stack}`);
                }
            });
        } else {
            log(`Skipping non-markdown active document: ${activeEditor.document.languageId}`);
        }
    } else {
        log('No active editor found');
    }

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('entangled-vscode.goToDefinition', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) return;

            const position = editor.selection.active;
            const provider = new EntangledDefinitionProvider();
            const definitions = await provider.provideDefinition(editor.document, position, new vscode.CancellationTokenSource().token);
            
            if (definitions && (Array.isArray(definitions) ? definitions.length > 0 : true)) {
                const location = Array.isArray(definitions) ? definitions[0] : definitions;
                await vscode.window.showTextDocument(location.uri, {
                    selection: location.range
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

    log('Entangled VSCode extension activated successfully');
}

// This method is called when your extension is deactivated
export function deactivate() {
    // Clean up if needed
    const documentManager = DocumentManager.getInstance();
    documentManager.clearCache();
}
