// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { EntangledProcessor } from './core/processor';
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
    
    const processor = EntangledProcessor.getInstance();
    
    // Add output channel to subscriptions
    context.subscriptions.push(outputChannel);

    // Register for both markdown and entangled-markdown files
    const selector = [
        { language: 'markdown', scheme: 'file' },
        { language: 'entangled-markdown', scheme: 'file' }
    ];
    
    // Process active document if any
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor && selector.some(s => s.language === activeEditor.document.languageId)) {
        processor.parse(activeEditor.document).catch(err => {
            log(`Error parsing active document: ${err}`);
        });
    }

    // Watch for document changes
    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument(async (e) => {
            if (e.document.uri.scheme === 'output') return;
            if (!selector.some(s => s.language === e.document.languageId)) return;
            
            // Invalidate cache and reparse
            processor.invalidate(e.document.uri.toString());
            await processor.parse(e.document);
        })
    );

    // Register providers
    context.subscriptions.push(
        vscode.languages.registerDocumentSymbolProvider(
            selector,
            new EntangledDocumentSymbolProvider(processor)
        ),
        vscode.languages.registerDefinitionProvider(
            selector,
            new EntangledDefinitionProvider(processor)
        ),
        vscode.languages.registerReferenceProvider(
            selector,
            new EntangledReferenceProvider(processor)
        ),
        vscode.languages.registerHoverProvider(
            selector,
            new EntangledHoverProvider(processor)
        )
    );

    log('Entangled VSCode extension activated successfully');
}

// This method is called when your extension is deactivated
export function deactivate() {
    // Clean up if needed
    const processor = EntangledProcessor.getInstance();
    processor.clearCache();
}
