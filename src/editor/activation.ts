import * as vscode from 'vscode';
import { LiterateManager } from '../core/literate/manager';
import { Logger } from '../utils/logger';
import { LANGUAGE, SCHEMES } from '../utils/constants';
import {
  EntangledDefinitionProvider,
  EntangledReferenceProvider,
  EntangledHoverProvider,
  EntangledDocumentSymbolProvider,
} from './providers/navigation';
import { DecorationProvider } from './providers/decoration';
import { CommandHandler } from './commands';

/** Handles the activation of the extension in VSCode */
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

  /** Register all providers for the extension */
  private registerProviders(context: vscode.ExtensionContext): void {
    this.logger.debug('Registering providers');

    try {
      context.subscriptions.push(
        vscode.languages.registerDefinitionProvider(
          { scheme: SCHEMES.FILE, language: LANGUAGE.ID },
          new EntangledDefinitionProvider()
        ),
        vscode.languages.registerReferenceProvider(
          { scheme: SCHEMES.FILE, language: LANGUAGE.ID },
          new EntangledReferenceProvider()
        ),
        vscode.languages.registerHoverProvider(
          { scheme: SCHEMES.FILE, language: LANGUAGE.ID },
          new EntangledHoverProvider()
        ),
        vscode.languages.registerDocumentSymbolProvider(
          { scheme: SCHEMES.FILE, language: LANGUAGE.ID },
          new EntangledDocumentSymbolProvider()
        )
      );

      this.logger.debug('Providers registered successfully');
    } catch (error) {
      this.logger.error(
        'Failed to register providers',
        error instanceof Error ? error : new Error(String(error))
      );
      throw error;
    }
  }

  /** Register all commands for the extension */
  private registerCommands(context: vscode.ExtensionContext): void {
    this.logger.debug('Registering commands');

    try {
      this.commandHandler.register(context);
      this.logger.debug('Commands registered successfully');
    } catch (error) {
      this.logger.error(
        'Failed to register commands',
        error instanceof Error ? error : new Error(String(error))
      );
      throw error;
    }
  }

  /** Activate the extension */
  public activate(context: vscode.ExtensionContext): void {
    this.logger.debug('Starting extension activation', {
      workspace: vscode.workspace.name,
      extensionMode: context.extensionMode,
    });

    try {
      // Register providers
      this.registerProviders(context);

      // Register commands
      this.registerCommands(context);

      // Activate decoration provider
      this.decorationProvider.activate(context);
      this.logger.debug('Decoration provider activated');

      this.logger.debug('Extension components activated successfully');
    } catch (error) {
      this.logger.error(
        'Failed to activate extension components',
        error instanceof Error ? error : new Error(String(error))
      );
      throw error;
    }

    // Setup document change handling
    vscode.workspace.onDidChangeTextDocument(
      (event) => {
        if (event.document.languageId === LANGUAGE.ID) {
          this.documentManager
            .parseDocument(event.document)
            .catch((error) => this.logger.error('Failed to parse document on change', error));
        }
      },
      null,
      context.subscriptions
    );

    vscode.workspace.onDidOpenTextDocument(
      (document) => {
        if (document.languageId === LANGUAGE.ID) {
          this.documentManager
            .parseDocument(document)
            .catch((error) => this.logger.error('Failed to parse document on open', error));
        }
      },
      null,
      context.subscriptions
    );

    this.logger.info('EntangleD extension activated');
  }

  /** Deactivate the extension */
  public deactivate(): void {
    this.logger.info('Deactivating EntangleD extension');
    this.decorationProvider.dispose();
    this.logger.dispose();
  }
}
