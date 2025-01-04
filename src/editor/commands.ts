import * as vscode from 'vscode';
import { LiterateManager } from '../core/literate/manager';
import { Logger } from '../utils/logger';

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
            })
        );
    }
}
