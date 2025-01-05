import * as vscode from 'vscode';
import { Logger } from '../../utils/logger';
import { PandocError } from '../../utils/errors';
import { LANGUAGE, PATTERNS } from '../../utils/constants';
import { PandocCodeBlock } from './types';
import { spawn } from 'child_process';

// Type definitions for Pandoc AST
type PandocAttribute = [string | null, string[], [string, string][]];
type PandocCodeBlockData = [PandocAttribute, string];
interface PandocBlock {
  t: string;
  c: PandocCodeBlockData | PandocBlock[];
}
interface PandocAST {
  blocks: PandocBlock[];
}

export class PandocService {
  private static instance: PandocService;
  private logger: Logger;

  private constructor() {
    this.logger = Logger.getInstance();
  }

  public static getInstance(): PandocService {
    if (!PandocService.instance) {
      PandocService.instance = new PandocService();
    }
    return PandocService.instance;
  }

  public async getCodeBlocksFromDocument(
    document: vscode.TextDocument
  ): Promise<PandocCodeBlock[]> {
    const ast = await this.convertToPandocAST(document);
    return this.extractCodeBlocks(ast);
  }

  private async convertToPandocAST(document: vscode.TextDocument): Promise<PandocAST> {
    this.logger.debug('PandocService::Converting document to AST', {
      uri: document.uri.toString(),
      size: document.getText().length,
    });

    try {
      const args = ['-f', LANGUAGE.PANDOC_FORMAT, '-t', 'json'];

      const result = await this.subProcessRunPandoc(document.getText(), args);
      const ast = JSON.parse(result) as PandocAST;

      this.logger.debug('PandocService::Document converted to AST successfully');
      return ast;
    } catch (error) {
      if (error instanceof PandocError) {
        throw error;
      }
      throw new PandocError(
        'Failed to convert document to AST',
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  private async subProcessRunPandoc(input: string, args: string[]): Promise<string> {
    this.logger.debug('PandocService::Executing pandoc', { args });

    return new Promise((resolve, reject) => {
      const process = spawn('pandoc', args);
      let stdout = '';
      let stderr = '';

      process.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('error', (error) => {
        this.logger.error('Pandoc process error', error);
        reject(new PandocError('Failed to execute pandoc', stderr || error.message));
      });

      process.on('close', (code) => {
        if (code !== 0) {
          this.logger.error('Pandoc exited with error', undefined, {
            code,
            stderr,
          });
          reject(new PandocError(`Pandoc exited with code ${code}`, stderr));
          return;
        }
        resolve(stdout);
      });

      process.stdin.write(input);
      process.stdin.end();
    });
  }

  private extractCodeBlocks(ast: PandocAST): PandocCodeBlock[] {
    this.logger.debug('PandocService::Extracting code blocks from AST');

    try {
      if (!ast || !ast.blocks) {
        this.logger.error('Invalid AST structure');
        throw new PandocError('Invalid AST structure', '');
      }

      const blocks: PandocCodeBlock[] = [];

      const extractFromBlock = (block: PandocBlock): void => {
        if (block.t === 'CodeBlock') {
          const [attributes, content] = block.c as PandocCodeBlockData;
          const [[rawId, classes, _]] = [attributes]; // key-value pairs are unused for now. It's a list of tuples
          // this.logger.debug('PandocCodeBlock:: rawId, classes, keyVals = ', { rawId, classes, keyVals });

          // check empty
          let identifier = rawId ? rawId : undefined;
          if (identifier) {
            const references = Array.from(content.matchAll(PATTERNS.ALL_REFERENCES)).map(
              (match) => match[1]
            );

            blocks.push({
              identifier,
              language: classes?.[0]?.replace('.', '') || '',
              content,
              references,
            });
            this.logger.debug('PandocService::extractCodeBlocks::Found references', {
              identifier,
              references,
              // lastBlock: blocks[blocks.length - 1]
            });
          }
        } else if (Array.isArray(block.c)) {
          for (const child of block.c) {
            if (typeof child === 'object' && child !== null) {
              extractFromBlock(child as PandocBlock);
            }
          }
        }
      };

      for (const block of ast.blocks) {
        extractFromBlock(block);
      }

      this.logger.debug('PandocService::extractCodeBlocks:: extracted successfully', {
        count: blocks.length,
      });

      return blocks;
    } catch (error) {
      throw new PandocError(
        'Failed to extract code blocks from AST',
        error instanceof Error ? error.message : String(error)
      );
    }
  }
}
