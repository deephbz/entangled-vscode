import * as vscode from 'vscode';
import { Logger } from '../../utils/logger';
import { BlocksByIdentifier, IdentifiersByUri, DocumentBlock, CircularReference } from './entities';
import { ILiterateParser, LiterateParser } from './parser';
import {
  BlockNotFoundError,
  DocumentParseError,
  EntangledError,
  BlockSyntaxError,
  CircularReferenceError,
} from '../../utils/errors';
import { PandocService } from '../pandoc/service'; // Assuming PandocService is imported from this location

export interface ILiterateManager {
  getDocumentBlocks(uri: string): ReadonlyArray<DocumentBlock> | undefined;
  parseDocument(document: vscode.TextDocument): Promise<void>;
  findDefinition(identifier: string): Promise<vscode.Location | null>;
  findReferences(identifier: string): Promise<vscode.Location[]>;
  findCircularReferences(): CircularReference[];
  getExpandedContent(identifier: string): string;
  clearCache(): void;
}

export class LiterateManager implements ILiterateManager {
  private static instance: LiterateManager;
  protected blocksByIdentifier: BlocksByIdentifier = {};
  private IdentifiersByUri: IdentifiersByUri = {};
  private logger: Logger;
  private parser: ILiterateParser;

  private constructor() {
    this.logger = Logger.getInstance();
    this.parser = new LiterateParser();
  }

  public static getInstance(): LiterateManager {
    if (!LiterateManager.instance) {
      LiterateManager.instance = new LiterateManager();
    }
    return LiterateManager.instance;
  }

  async parseDocument(document: vscode.TextDocument): Promise<void> {
    const uri = document.uri.toString();
    this.logger.debug('manager::parseDocument::Parsing', { uri });

    try {
      const newDocBlocks = await this.extractCodeBlocks(document);

      if (newDocBlocks.length === 0) {
        this.logger.debug('manager::parseDocument::No code blocks found', {
          uri,
        });
        return;
      }

      this.logger.debug('manager::parseDocument::Code blocks extracted', {
        count: newDocBlocks.length,
      });

      // Clear existing blocks for this document
      this.clearDocumentBlocks(uri);

      // Process and add new blocks
      try {
        const processedBlocks = this.parser.parseDocumentAndDecorateBlocks(document, newDocBlocks);
        this.logger.debug('manager::parseDocument::Blocks processed', {
          totalBlocks: processedBlocks.length,
          withIdentifiers: processedBlocks.filter((b) => b.identifier).length,
        });

        this.addDocumentBlocks(uri, processedBlocks);
      } catch (error) {
        throw new DocumentParseError(error instanceof Error ? error.message : String(error), uri);
      }

      // Update dependencies
      this.updateDependencies();

      // Check for circular references
      const circular = this.findCircularReferences();
      if (circular.length > 0) {
        this.logger.warn('Circular references detected', {
          count: circular.length,
          references: circular.map((ref) => ref.path),
        });
      }

      // for (const blocks of Object.values(this.documents)) {
      //     for (const block of blocks) {
      //     this.logger.debug('manager::AfterUpdateDeps::Block content', {
      //             identifier: block.identifier,
      //             content: block.content,
      //             location: block.location,
      //             expandedContent: block.expandedContent,
      //             dependencies: Array.from(block.dependencies),
      //             dependents: Array.from(block.dependents),
      //             referenceRanges: block.referenceRanges
      //         }
      //     );
      //     }
      // }
    } catch (error) {
      if (error instanceof EntangledError) {
        throw error;
      }
      throw new DocumentParseError(error instanceof Error ? error.message : String(error), uri);
    }
  }

  private async extractCodeBlocks(document: vscode.TextDocument): Promise<DocumentBlock[]> {
    const pandocService = PandocService.getInstance();
    try {
      const pandocBlocks = await pandocService.getCodeBlocksFromDocument(document);

      // Convert PandocCodeBlock to DocumentBlock
      return pandocBlocks.map((block) => ({
        ...block,
        location: {
          uri: document.uri,
          range: new vscode.Range(0, 0, 0, 0), // This will be updated by the parser
          identifier: block.identifier,
        },
        dependencies: new Set(block.references),
        dependents: new Set(),
        referenceRanges: [],
      }));
    } catch (error) {
      this.logger.error(
        'Failed to extract code blocks',
        error instanceof Error ? error : new Error(String(error))
      );
      throw error;
    }
  }

  private clearDocumentBlocks(uri: string): void {
    if (this.IdentifiersByUri[uri]) {
      this.logger.debug('manager::clearDocumentBlocks::Clearing existing blocks', { uri });
      for (const identifier of this.IdentifiersByUri[uri]) {
        this.blocksByIdentifier[identifier] =
          this.blocksByIdentifier[identifier]?.filter(
            (block) => block.location.uri.toString() !== uri
          ) || [];
        if (this.blocksByIdentifier[identifier].length === 0) {
          delete this.blocksByIdentifier[identifier];
        }
      }
    }
    this.IdentifiersByUri[uri] = new Set();
  }

  private addDocumentBlocks(uri: string, blocks: DocumentBlock[]): void {
    for (const block of blocks) {
      if (!this.blocksByIdentifier[block.identifier]) {
        this.blocksByIdentifier[block.identifier] = [];
      }
      this.blocksByIdentifier[block.identifier].push(block);
      this.IdentifiersByUri[uri].add(block.identifier);
    }
  }

  private updateDependencies(): void {
    this.logger.debug('manager::updateDependencies::Updating');

    // Clear existing dependents
    for (const blocks of Object.values(this.blocksByIdentifier)) {
      for (const block of blocks) {
        block.dependents.clear();
      }
    }

    // Update dependents based on dependencies
    for (const blocks of Object.values(this.blocksByIdentifier)) {
      for (const block of blocks) {
        for (const dep of block.dependencies) {
          const depBlocks = this.blocksByIdentifier[dep];
          if (depBlocks) {
            for (const depBlock of depBlocks) {
              depBlock.dependents.add(block.identifier);
            }
          }
        }
      }
    }
  }

  findDefinition(identifier: string): Promise<vscode.Location | null> {
    this.logger.debug('manager::findDefinition::Finding', { identifier });

    const locations = Object.values(this.blocksByIdentifier)
      .flatMap((blocks) => blocks)
      .filter((block) => block.identifier === identifier)
      .map((block) => new vscode.Location(block.location.uri, block.location.range));

    if (locations.length === 0) {
      this.logger.debug('manager::findDefinition::No definitions found', {
        identifier,
      });
      return Promise.resolve(null);
    } else {
      this.logger.debug('manager::findDefinition::Definitions found', {
        identifier,
        count: locations.length,
        locations: locations.map((loc) => loc.uri.toString()),
      });
      return Promise.resolve(locations[0]);
    }
  }

  findReferences(identifier: string): Promise<vscode.Location[]> {
    const locations = Object.values(this.blocksByIdentifier)
      .flatMap((blocks) => blocks)
      .filter((block) => block.dependencies.has(identifier))
      .map((block) => new vscode.Location(block.location.uri, block.location.range));

    if (locations.length === 0) {
      this.logger.debug('manager::findReferences::No references found', {
        identifier,
      });
    } else {
      this.logger.debug('manager::findReferences::References found', {
        identifier,
        count: locations.length,
        locations: locations.map((loc) => loc.uri.toString()),
      });
    }

    return Promise.resolve(locations);
  }

  findCircularReferences(): CircularReference[] {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const cycles: CircularReference[] = [];

    const dfs = (identifier: string, path: string[] = []): void => {
      if (recursionStack.has(identifier)) {
        const cycleStart = path.indexOf(identifier);
        if (cycleStart !== -1) {
          const cycle = {
            path: path.slice(cycleStart),
            start: identifier,
          };
          cycles.push(cycle);
          this.logger.warn('Found circular reference', { cycle });
        }
        return;
      }

      if (visited.has(identifier)) {
        return;
      }

      visited.add(identifier);
      recursionStack.add(identifier);
      path.push(identifier);

      const blocks = this.blocksByIdentifier[identifier];
      if (blocks) {
        for (const block of blocks) {
          for (const dep of block.dependencies) {
            dfs(dep, [...path]);
          }
        }
      }

      recursionStack.delete(identifier);
      path.pop();
    };

    for (const identifier of Object.keys(this.blocksByIdentifier)) {
      if (!visited.has(identifier)) {
        dfs(identifier);
      }
    }

    return cycles;
  }

  getExpandedContent(identifier: string): string {
    this.logger.debug('manager::getExpandedContent::Getting expanded content', {
      identifier,
    });

    const blocks = this.blocksByIdentifier[identifier];
    if (!blocks?.length) {
      throw new BlockNotFoundError(identifier);
    }

    try {
      const content = this.expand(identifier);
      this.logger.debug('manager::getExpandedContent: expanded successfully', {
        identifier,
      });
      return content;
    } catch (error) {
      if (error instanceof CircularReferenceError) {
        throw error;
      }
      throw new BlockSyntaxError(
        error instanceof Error ? error.message : String(error),
        identifier
      );
    }
  }

  private expand(id: string, visited: Set<string> = new Set()): string {
    if (visited.has(id)) {
      this.logger.warn('Circular reference detected during expansion', {
        identifier: id,
      });
      return `<<circular reference to ${id}>>`;
    }

    const blocks = this.blocksByIdentifier[id];
    if (!blocks?.length) {
      this.logger.warn('Block not found during expansion', { identifier: id });
      return `<<${id} not found>>`;
    }

    visited.add(id);
    let content = '';

    for (const block of blocks) {
      content += block.content.replace(/<<([^>]+)>>/g, (_, ref) => {
        return this.expand(ref, new Set(visited));
      });
      content += '\n';
    }

    visited.delete(id);
    return content;
  }

  /** Get read-only access to blocks for a specific document */
  getDocumentBlocks(_: string): ReadonlyArray<DocumentBlock> | undefined {
    // const identifiers = this.IdentifiersByUri[uri];
    // if (!identifiers) {
    //   return undefined;
    // }
    // return Array.from(identifiers).flatMap((id) => this.blocksByIdentifier[id]);
    return Object.values(this.blocksByIdentifier).flat();
  }

  getDocumentsUris(): Iterable<string> {
    return Object.keys(this.IdentifiersByUri);
  }

  clearCache(): void {
    this.blocksByIdentifier = {};
    this.IdentifiersByUri = {};
    this.logger.info('Cache cleared');
  }
}
