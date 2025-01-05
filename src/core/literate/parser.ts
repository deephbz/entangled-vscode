import * as vscode from 'vscode';
import { Logger } from '../../utils/logger';
import { DocumentBlock, CodeBlockLocation } from './entities';
import { PandocCodeBlock } from '../pandoc/types';
import { DocumentParseError } from '../../utils/errors';
import { PATTERNS } from '../../utils/constants';

/** Interface for parsing literate programming documents */
export interface ILiterateParser {
  parseDocumentAndDecorateBlocks(
    document: vscode.TextDocument,
    blocks: readonly PandocCodeBlock[]
  ): DocumentBlock[];
  findBlockLocation(
    document: vscode.TextDocument,
    block: DocumentBlock
  ): CodeBlockLocation | null;
  findReferencesUsedInBlock(document: vscode.TextDocument, block: DocumentBlock): vscode.Range[];
}

/** Default implementation of the literate programming parser */
export class LiterateParser implements ILiterateParser {
  private logger: Logger;

  constructor() {
    this.logger = Logger.getInstance();
  }

  public parseDocumentAndDecorateBlocks(
    document: vscode.TextDocument,
    blocks: readonly PandocCodeBlock[]
  ): DocumentBlock[] {
    this.logger.debug('LiterateParser::parseDocument:: Starting parsing', {
      uri: document.uri.toString(),
      blockCount: blocks.length,
    });

    const documentBlocks: DocumentBlock[] = [];

    try {
      for (const block of blocks) {
        const location = this.findBlockLocation(document, block);
        if (!location) {
          this.logger.warn('Could not find location for block', {
            identifier: block.identifier,
          });
          continue;
        }

        const references = this.findReferencesUsedInBlock(document, block);
        // this.logger.debug('Parser::parseDocumentAndDecorateBlocks:: pandocBlock ', { block, references });
        documentBlocks.push({
          ...block,
          location,
          referenceRanges: references,
          dependencies: new Set<string>(block.references),
          dependents: new Set<string>(),
        });
      }

      this.logger.debug('LiterateParser::parseDocument::Document parsing completed', {
        uri: document.uri.toString(),
        parsedBlocks: documentBlocks.length,
      });

      return documentBlocks;
    } catch (error) {
      throw new DocumentParseError(
        error instanceof Error ? error.message : String(error),
        document.uri.toString()
      );
    }
  }

  public findBlockLocation(
    document: vscode.TextDocument,
    block: PandocCodeBlock
  ): CodeBlockLocation | null {
    this.logger.debug('LiterateParser::findBlockLocation::Finding block location', {
      identifier: block.identifier,
      uri: document.uri.toString(),
    });

    try {
      const lineCount = document.lineCount;
      let inCodeBlock = false;

      for (let i = 0; i < lineCount; i++) {
        const line = document.lineAt(i);
        const trimmedText = line.text.trim();

        if (!trimmedText.startsWith('```')) {
          continue;
        }

        if (!inCodeBlock) {
          const match = trimmedText.match(PATTERNS.CODE_BLOCK_OPEN);
          if (match) {
            const idMatch = match[1].match(PATTERNS.BLOCK_IDENTIFIER);
            if (idMatch && idMatch[1] === block.identifier) {
              inCodeBlock = true;
              const startPos = line.range.start;
              
              // Find the closing fence
              for (let j = i + 1; j < lineCount; j++) {
                const endLine = document.lineAt(j);
                const endText = endLine.text.trim();
                
                if (endText === '```') {
                  const endPos = endLine.range.end;
                  
                  this.logger.debug('LiterateParser::findBlockLocation::Block location found', {
                    identifier: block.identifier,
                    startLine: i,
                    endLine: j,
                  });

                  return {
                    uri: document.uri,
                    range: new vscode.Range(startPos, endPos),
                  };
                }
              }
              
              // If we reach here, no closing fence was found
              this.logger.warn('LiterateParser::findBlockLocation::No closing fence found', {
                identifier: block.identifier,
                startLine: i,
              });
              return null;
            }
          }
        } else if (trimmedText === '```') {
          inCodeBlock = false;
        }
      }

      this.logger.debug('LiterateParser::findBlockLocation::Block not found', {
        identifier: block.identifier,
      });
      return null;

    } catch (error) {
      this.logger.error('LiterateParser::findBlockLocation::Error finding block location', error instanceof Error ? error : new Error(String(error)), {
        identifier: block.identifier,
      });
      return null;
    }
  }

  public findReferencesUsedInBlock(
    document: vscode.TextDocument,
    block: PandocCodeBlock
  ): vscode.Range[] {
    this.logger.debug('LiterateParser::findReferences::Finding references', {
      identifier: block.identifier,
      uri: document.uri.toString(),
    });

    const ranges: vscode.Range[] = [];
    const text = document.getText();

    try {
      for (const ref of block.references) {
        const pattern = PATTERNS.BLOCK_REFERENCE(ref);
        let match;

        while ((match = pattern.exec(text)) !== null) {
          const startPos = document.positionAt(match.index);
          const endPos = document.positionAt(match.index + match[0].length);
          ranges.push(new vscode.Range(startPos, endPos));
        }
      }

      this.logger.debug('LiterateParser::findReferences::References found', {
        identifier: block.identifier,
        count: ranges.length,
      });

      return ranges;
    } catch (error) {
      this.logger.error(
        'Error finding references',
        error instanceof Error ? error : new Error(String(error)),
        {
          identifier: block.identifier,
        }
      );
      return [];
    }
  }
}
