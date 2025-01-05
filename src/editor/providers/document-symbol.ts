import * as vscode from 'vscode';
import { DocumentBlock } from '../../core/literate/entities';
import { LiterateManager } from '../../core/literate/manager';
import { Logger } from '../../utils/logger';

/** Provides document symbol features for literate documents. */
export class EntangledDocumentSymbolProvider implements vscode.DocumentSymbolProvider {
  private static instance: EntangledDocumentSymbolProvider;
  private readonly logger = Logger.getInstance();
  private readonly manager = LiterateManager.getInstance();

  public static getInstance(): EntangledDocumentSymbolProvider {
    if (!EntangledDocumentSymbolProvider.instance) {
      EntangledDocumentSymbolProvider.instance = new EntangledDocumentSymbolProvider();
    }
    return EntangledDocumentSymbolProvider.instance;
  }

  async provideDocumentSymbols(
    document: vscode.TextDocument,
    token: vscode.CancellationToken
  ): Promise<vscode.DocumentSymbol[]> {
    this.logger.debug('document-symbol::provideDocumentSymbols', { uri: document.uri.toString() });

    if (token.isCancellationRequested) return [];

    const documentBlocks = this.manager.getDocumentBlocks(document.uri.toString());
    if (!documentBlocks) return [];

    return Object.entries(documentBlocks).flatMap(([identifier, blocks]) =>
      blocks.map((block) => {
        const symbol = new vscode.DocumentSymbol(
          identifier,
          `Code block #${block.blockCount}`,
          vscode.SymbolKind.Class,
          block.location.range,
          block.location.id_pos
        );
        symbol.detail = this.createBlockMetadata(block);
        return symbol;
      })
    );
  }

  /** Create metadata string for a block */
  private createBlockMetadata(block: DocumentBlock): string {
    const metadata = [
      `Block #${block.blockCount}`,
      block.language && `Language: ${block.language}`,
      block.dependencies.size > 0 && `Dependencies: ${Array.from(block.dependencies).join(', ')}`,
      block.dependents.size > 0 && `Referenced by: ${Array.from(block.dependents).join(', ')}`,
    ].filter(Boolean);

    return metadata.join('\n');
  }
}
