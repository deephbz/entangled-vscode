import * as vscode from 'vscode';
import { LiterateManager } from '../core/literate/manager';
import { Logger } from '../utils/logger';
import { EntangledDefinitionProvider, EntangledReferenceProvider } from './providers/navigation';

/**
 * Registers and handles all VSCode commands for the extension
 */
export class CommandHandler {
    private documentManager: LiterateManager;
    private logger: Logger;

    constructor() {
        this.documentManager = LiterateManager.getInstance();
        this.logger = Logger.getInstance();
    }

    /**
     * Register all commands with VSCode
     */
    public register(context: vscode.ExtensionContext): void {
        context.subscriptions.push(
            vscode.commands.registerCommand('entangled.showOutput', () => {
                this.logger.show();
            }),
            
            vscode.commands.registerCommand('entangled.clearCache', () => {
                this.documentManager.clearCache();
                this.logger.info('Cache cleared');
            }),

            vscode.commands.registerCommand('entangled.parseDocument', () => {
                const editor = vscode.window.activeTextEditor;
                if (editor) {
                    this.documentManager.parseDocument(editor.document)
                        .then(() => {
                            this.logger.info('Document parsed successfully');
                        })
                        .catch(error => {
                            this.logger.error('Failed to parse document', error);
                            vscode.window.showErrorMessage('Failed to parse document: ' + error.message);
                        });
                }
            }),

            vscode.commands.registerCommand('entangled.goToDefinition', CommandHandlers.goToDefinition),

            vscode.commands.registerCommand('entangled.findReferences', CommandHandlers.findReferences),

            vscode.commands.registerCommand('entangled.peekReferences', CommandHandlers.peekReferences)
        );
    }
}

export class CommandHandlers {
    public static goToDefinition = async () => {
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

    public static findReferences = async () => {
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

    public static peekReferences = async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;

        await vscode.commands.executeCommand(
            'editor.action.referenceSearch.trigger'
        );
    };
}
