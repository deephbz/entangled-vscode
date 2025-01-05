import * as vscode from 'vscode';
import { Logger } from '../../utils/logger';
import { DocumentBlock, CodeBlockRange, NoWebReference } from './entities';
import { PandocCodeBlock } from '../pandoc/types';
import { DocumentParseError } from '../../utils/errors';
import { PATTERNS } from '../../utils/constants';

/** Interface for parsing literate programming documents */
export interface ILiterateParser {
  parseDocumentCodeBlocks( document: vscode.TextDocument, blocks: readonly PandocCodeBlock[]): DocumentBlock[];
  parseDocumentReferences(document: vscode.TextDocument): NoWebReference[];
  findBlockLocation(document: vscode.TextDocument, block: DocumentBlock): CodeBlockRange | null;
  // findReferencesUsedInBlock(document: vscode.TextDocument, block: DocumentBlock): vscode.Range[];
}

/** Default implementation of the literate programming parser */
export class LiterateParser implements ILiterateParser {
  private logger: Logger;

  constructor() {
    this.logger = Logger.getInstance();
  }

  public parseDocumentCodeBlocks(
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
        this.logger.debug('LiterateParser::parseDocumentAndDecorateBlocks:: Block location found', {
          id: block.identifier,
          cnt: block.blockCount,
          idCnt: block.idCount,
          id_pos: location.id_pos,
          block_range: location.range,
        });

        // const references = this.findReferencesUsedInBlock(document, block);
        // this.logger.debug('Parser::parseDocumentAndDecorateBlocks:: pandocBlock ', { block, references });
        documentBlocks.push({
          ...block,
          location,
          // referenceRanges: references,
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

  public parseDocumentReferences(document: vscode.TextDocument): NoWebReference[] {
    const references: NoWebReference[] = [];
    const referenceMatches = Array.from(document.getText().matchAll(PATTERNS.ALL_REFERENCES));
    for (const match of referenceMatches) {
      // Ensure we have both the full match and captured group
      if (match.index === undefined || !match[1]) {
        continue;
      }
      const fullReferenceMatch = match[0];  // includes reference markers
      const referenceIdentifier = match[1]; // just the identifier content
      const startPos = document.positionAt(match.index);
      const endPos = document.positionAt(match.index + fullReferenceMatch.length);
      references.push({
        identifier: referenceIdentifier,
        location: {
          uri: document.uri,
          id_pos: new vscode.Range(startPos, endPos),
        },
      });
    }
    return references;
  }


  private createBlockLocation(
    document: vscode.TextDocument,
    startLine: vscode.TextLine,
    endLine: vscode.TextLine,
    identifier: string
  ): CodeBlockRange {
    const idStart = startLine.text.indexOf(identifier);
    const idPos = new vscode.Range(
      startLine.range.start.translate(0, idStart),
      startLine.range.start.translate(0, idStart + identifier.length)
    );

    return {
      uri: document.uri,
      id_pos: idPos,
      range: new vscode.Range(startLine.range.start, endLine.range.end),
    };
  }

  private findClosingFence(
    document: vscode.TextDocument,
    startLineNum: number
  ): vscode.TextLine | null {
    for (let i = startLineNum + 1; i < document.lineCount; i++) {
      const line = document.lineAt(i);
      if (line.text.trim() === '```') {
        return line;
      }
    }
    return null;
  }

  private isBlockIdentifierMatch(line: string, targetIdentifier: string): boolean {
    const match = line.trim().match(PATTERNS.CODE_BLOCK_OPEN);
    if (!match) return false;

    const idMatch = match[1].match(PATTERNS.BLOCK_IDENTIFIER);
    return idMatch ? idMatch[1] === targetIdentifier : false;
  }

  public findBlockLocation(
    document: vscode.TextDocument,
    block: PandocCodeBlock
  ): CodeBlockRange | null {
    this.logger.debug('LiterateParser::findBlockLocation::Finding block location', {
      identifier: block.identifier,
      idCount: block.idCount,
      uri: document.uri.toString(),
    });

    try {
      let currentIdCount = 0;

      for (let i = 0; i < document.lineCount; i++) {
        const line = document.lineAt(i);
        const trimmedText = line.text.trim();

        if (!trimmedText.startsWith('```')) {
          continue;
        }

        if (!this.isBlockIdentifierMatch(line.text, block.identifier)) {
          continue;
        }

        if (currentIdCount !== block.idCount) {
          currentIdCount++;
          continue;
        }

        // Found the matching block, now find its closing fence
        const closingLine = this.findClosingFence(document, i);
        if (!closingLine) {
          this.logger.warn('LiterateParser::findBlockLocation::No closing fence found', {
            identifier: block.identifier,
            idCount: block.idCount,
            startLine: i,
          });
          return null;
        }

        return this.createBlockLocation(document, line, closingLine, block.identifier);
      }

      this.logger.debug('LiterateParser::findBlockLocation::Block not found', {
        identifier: block.identifier,
        idCount: block.idCount,
      });
      return null;
    } catch (error) {
      this.logger.error(
        'LiterateParser::findBlockLocation::Error finding block location',
        error instanceof Error ? error : new Error(String(error)),
        {
          identifier: block.identifier,
          idCount: block.idCount,
        }
      );
      return null;
    }
  }

  // public findReferencesUsedInBlock(
  //   document: vscode.TextDocument,
  //   block: PandocCodeBlock
  // ): vscode.Range[] {
  //   this.logger.debug('LiterateParser::findReferences::Finding references', {
  //     identifier: block.identifier,
  //     uri: document.uri.toString(),
  //   });

  //   const ranges: vscode.Range[] = [];
  //   const text = document.getText();

  //   try {
  //     for (const ref of block.references) {
  //       const pattern = PATTERNS.BLOCK_REFERENCE(ref);
  //       let match;

  //       while ((match = pattern.exec(text)) !== null) {
  //         const startPos = document.positionAt(match.index);
  //         const endPos = document.positionAt(match.index + match[0].length);
  //         ranges.push(new vscode.Range(startPos, endPos));
  //       }
  //     }

  //     this.logger.debug('LiterateParser::findReferences::References found', {
  //       identifier: block.identifier,
  //       count: ranges.length,
  //     });

  //     return ranges;
  //   } catch (error) {
  //     this.logger.error(
  //       'Error finding references',
  //       error instanceof Error ? error : new Error(String(error)),
  //       {
  //         identifier: block.identifier,
  //       }
  //     );
  //     return [];
  //   }
  // }
}
