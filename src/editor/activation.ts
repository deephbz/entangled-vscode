import * as vscode from 'vscode';
import { LiterateManager } from '../core/literate/manager';
import { Logger } from '../utils/logger';
import { EntangledDefinitionProvider, EntangledReferenceProvider, EntangledHoverProvider, EntangledDocumentSymbolProvider } from './providers/navigation';
import { DecorationProvider } from './providers/decoration';
import { CommandHandler } from './commands';

/**
 * Handles the activation of the extension in VSCode
 */
export class ExtensionActivator {
    private documentManager: LiterateManager;
    private logger: Logger;
    private decorationProvider: DecorationProvider;
    private commandHandler: CommandHandler;

    constructor() {
        this.documentManager = LiterateManager.getInstance();
        this.logger = Logger.getInstance();
        this.decorationProvider = DecorationProvider.getInstance();
        this.commandHandler = new CommandHandler();
    }

    /**
     * Activate the extension
     */
    public activate(context: vscode.ExtensionContext): void {
        this.logger.info('Activating EntangleD extension');

        // Register providers
        context.subscriptions.push(
            vscode.languages.registerDefinitionProvider(
                { scheme: 'file', language: 'markdown' },
                new EntangledDefinitionProvider()
            ),
            vscode.languages.registerReferenceProvider(
                { scheme: 'file', language: 'markdown' },
                new EntangledReferenceProvider()
            ),
            vscode.languages.registerHoverProvider(
                { scheme: 'file', language: 'markdown' },
                new EntangledHoverProvider()
            ),
            vscode.languages.registerDocumentSymbolProvider(
                { scheme: 'file', language: 'markdown' },
                new EntangledDocumentSymbolProvider()
            )
        );

        // Activate decoration provider
        this.decorationProvider.activate(context);

        // Register commands
        this.commandHandler.register(context);

        // Setup document change handling
        vscode.workspace.onDidChangeTextDocument(
            event => {
                if (event.document.languageId === 'markdown') {
                    this.documentManager.parseDocument(event.document)
                        .catch(error => this.logger.error('Failed to parse document on change', error));
                }
            },
            null,
            context.subscriptions
        );

        vscode.workspace.onDidOpenTextDocument(
            document => {
                if (document.languageId === 'markdown') {
                    this.documentManager.parseDocument(document)
                        .catch(error => this.logger.error('Failed to parse document on open', error));
                }
            },
            null,
            context.subscriptions
        );

        this.logger.info('EntangleD extension activated');
    }

    /**
     * Deactivate the extension
     */
    public deactivate(): void {
        this.logger.info('Deactivating EntangleD extension');
        this.decorationProvider.dispose();
        this.logger.dispose();
    }
}
