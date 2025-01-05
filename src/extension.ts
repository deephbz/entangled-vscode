import * as vscode from 'vscode';
import { LiterateManager } from './core/literate/manager';
import { ExtensionActivator } from './editor/activation';
import { Logger } from './utils/logger';
import { PandocError, DocumentParseError } from './utils/errors';
import { LANGUAGE } from './utils/constants';

// Extension Output Channel
const logger = Logger.getInstance();

// Document Processing
const isMarkdownDocument = (document: vscode.TextDocument): boolean => document.languageId === LANGUAGE.ID;

const handleDocument = async (document: vscode.TextDocument): Promise<void> => {
  // Skip non-file documents and output channels
  if (document.uri.scheme !== 'file') {
    // Only log for non-output schemes to avoid recursion
    if (document.uri.scheme !== 'output') {
      logger.debug('handleDocument::Skipping non-file document', {
        uri: document.uri.toString(),
        scheme: document.uri.scheme,
      });
    }
    return;
  }

  if (!isMarkdownDocument(document)) {
    logger.debug('handleDocument::Skipping non-markdown document', {
      uri: document.uri.toString(),
      languageId: document.languageId,
    });
    return;
  }

  try {
    logger.debug('handleDocument::Starting document processing', {
      uri: document.uri.toString(),
      size: document.getText().length,
    });

    // Parse document
    await LiterateManager.getInstance().parseDocument(document);
    logger.debug('handleDocument::processed successfully');
  } catch (error) {
    if (error instanceof PandocError) {
      logger.error('Pandoc processing failed', error, {
        uri: document.uri.toString(),
      });
      vscode.window.showErrorMessage('Failed to process document: Pandoc error');
    } else if (error instanceof DocumentParseError) {
      logger.error('Document parsing failed', error, {
        uri: document.uri.toString(),
      });
      vscode.window.showErrorMessage('Failed to process document: Parse error');
    } else {
      logger.error(
        'Unknown error during document processing',
        error instanceof Error ? error : new Error(String(error)),
        { uri: document.uri.toString() }
      );
    }
  }
};

// Extension Lifecycle
export function activate(context: vscode.ExtensionContext): void {
  logger.info('Activating EntangleD extension', {
    workspace: vscode.workspace.name,
    extensionMode: context.extensionMode,
  });

  try {
    const activator = new ExtensionActivator();
    activator.activate(context);

    // Register document listeners
    context.subscriptions.push(
      vscode.workspace.onDidOpenTextDocument(handleDocument),
      vscode.workspace.onDidChangeTextDocument((e) => handleDocument(e.document)),
      vscode.workspace.onDidSaveTextDocument(handleDocument)
    );

    // Process any already open text editors
    vscode.workspace.textDocuments.forEach(handleDocument);

    logger.info('Extension activated successfully');
  } catch (error) {
    logger.error('Failed to activate extension', error instanceof Error ? error : new Error(String(error)));
    vscode.window.showErrorMessage('Failed to activate EntangleD extension');
  }
}

export function deactivate(): void {
  logger.info('Deactivating EntangleD extension');
}

export { logger };
