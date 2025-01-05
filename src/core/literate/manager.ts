import * as vscode from 'vscode';
import { Logger } from '../../utils/logger';
import {
  WorkspaceEntities,
  DocumentEntities,
  DocumentBlock,
  CircularReference,
} from './entities';
import { PandocCodeBlock } from '../pandoc/types';
import { ILiterateParser, LiterateParser } from './parser';
import {
  BlockNotFoundError,
  DocumentParseError,
  EntangledError,
  BlockSyntaxError,
  CircularReferenceError,
} from '../../utils/errors';
import { PandocService } from '../pandoc/service';

export interface ILiterateManager {
  getDocumentEntities(uri: string): DocumentEntities | undefined;
  parseDocument(document: vscode.TextDocument): Promise<void>;
  findDefinition(identifier: string): Promise<vscode.Location | null>;
  findReferences(identifier: string): Promise<vscode.Location[]>;
  findCircularReferences(): CircularReference[];
  getExpandedContent(identifier: string): string;
  clearCache(): void;
}

export class LiterateManager implements ILiterateManager {
  private static instance: LiterateManager;
  protected workspace: WorkspaceEntities = {};
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
      // Process blocks (definitions)
      const pandocCodeBlocks = await this.extractCodeBlocks(document);
      if (pandocCodeBlocks.length === 0) return;
      const processedBlocks = this.parser.parseDocumentCodeBlocks(
        document,
        pandocCodeBlocks
      );
      this.logger.debug('manager::parseDocument::Blocks processed', {
        numPandocBlocks: pandocCodeBlocks.length,
        numProcessedBlocks: processedBlocks.length,
        withIdentifiers: processedBlocks.filter((b) => b.identifier).length,
      });

      // process references
      const references = this.parser.parseDocumentReferences(document);

      this.clearDocumentEntities(uri);
      const blocksWithIds = processedBlocks.filter((b) => b.identifier);
      for (const block of blocksWithIds) {
        if (!this.workspace[uri].blocks[block.identifier]) {
          this.workspace[uri].blocks[block.identifier] = [];
        }
        this.workspace[uri].blocks[block.identifier].push(block);
      }
      for (const ref of references) {
        this.workspace[uri].references[ref.identifier] = ref;
      }

      // Update dependencies // TODO: only for blocks now 
      this.updateDependencies();

      // Check for circular references
      const circular = this.findCircularReferences();
      if (circular.length > 0) {
        this.logger.warn('Circular references detected', {
          count: circular.length,
          references: circular.map((ref) => ref.path),
        });
      }
    } catch (error) {
      if (error instanceof EntangledError) {
        throw error;
      }
      throw new DocumentParseError(error instanceof Error ? error.message : String(error), uri);
    }
  }

  private async extractCodeBlocks(document: vscode.TextDocument): Promise<PandocCodeBlock[]> {
    // Let Pandoc process codeblock starting line like ```{.class1 .class2 #identifier key1=value1 key2=value2}
    const pandocService = PandocService.getInstance();
    try {
      const pandocBlocks = await pandocService.getCodeBlocksFromDocument(document);
      return pandocBlocks;
    } catch (error) {
      this.logger.error(
        'Failed to extract code blocks',
        error instanceof Error ? error : new Error(String(error))
      );
      throw error;
    }
  }

  private clearDocumentEntities(uri: string): void {
    delete this.workspace[uri];
    // and init
    if (!this.workspace[uri]) {
      this.workspace[uri] = {
        blocks: {},
        references: {}
      };
    }
  }

  private updateDependencies(): void {
    this.logger.debug('manager::updateDependencies::Updating');

    // Clear existing dependents
    for (const docEntities of Object.values(this.workspace)) {
      for (const blocks of Object.values(docEntities.blocks)) {
        for (const block of blocks) {
          block.dependents.clear();
        }
      }
    }

    // Update dependents based on dependencies
    for (const docEntities of Object.values(this.workspace)) {
      for (const blocks of Object.values(docEntities.blocks)) {
        for (const block of blocks) {
          for (const dep of block.dependencies) {
            // Search for dependency across all documents
            for (const targetDoc of Object.values(this.workspace)) {
              const depBlocks = targetDoc.blocks[dep];
              if (depBlocks) {
                for (const depBlock of depBlocks) {
                  depBlock.dependents.add(block.identifier);
                }
              }
            }
          }
        }
      }
    }
  }

  findDefinition(identifier: string): Promise<vscode.Location | null> {
    this.logger.debug('manager::findDefinition::Finding', { identifier });

    const locations = Object.values(this.workspace)
      .flatMap((docEntities) => Object.values(docEntities.blocks))
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
    const locations = Object.values(this.workspace)
      .flatMap((docEntities) => Object.values(docEntities.blocks))
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

      // Search for dependencies across all documents
      for (const docEntities of Object.values(this.workspace)) {
        const blocks = docEntities.blocks[identifier];
        if (blocks) {
          for (const block of blocks) {
            for (const dep of block.dependencies) {
              dfs(dep, [...path]);
            }
          }
        }
      }

      recursionStack.delete(identifier);
      path.pop();
    };

    // Start DFS from each identifier in each document
    for (const docEntities of Object.values(this.workspace)) {
      for (const identifier of Object.keys(docEntities.blocks)) {
        if (!visited.has(identifier)) {
          dfs(identifier);
        }
      }
    }

    return cycles;
  }

  getExpandedContent(identifier: string): string {
    this.logger.debug('manager::getExpandedContent::Getting expanded content', {
      identifier,
    });

    // Search for blocks across all documents
    let blocks: DocumentBlock[] | undefined;
    for (const docEntities of Object.values(this.workspace)) {
      if (docEntities.blocks[identifier]) {
        blocks = docEntities.blocks[identifier];
        break;
      }
    }

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

    // Search for blocks across all documents
    let blocks: DocumentBlock[] | undefined;
    for (const docEntities of Object.values(this.workspace)) {
      if (docEntities.blocks[id]) {
        blocks = docEntities.blocks[id];
        break;
      }
    }

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

  getDocumentEntities(uri: string): DocumentEntities | undefined {
    return this.workspace[uri];
  }

  clearCache(): void {
    this.workspace = {};
    this.logger.info('Cache cleared');
  }
}
