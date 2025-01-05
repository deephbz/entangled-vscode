import * as vscode from 'vscode';
import { Logger } from '../../utils/logger';
import { LANGUAGE, PATTERNS } from '../../utils/constants';
import { defaultDecorationConfig } from '../../config/decoration';

/** Manages decorations for literate programming elements in the editor */
export class DecorationProvider {
  private static instance: DecorationProvider;
  private logger: Logger;
  private definitionDecorationType: vscode.TextEditorDecorationType;
  private referenceDecorationType: vscode.TextEditorDecorationType;
  private activeEditor?: vscode.TextEditor;
  private timeout?: NodeJS.Timeout;

  private constructor() {
    this.logger = Logger.getInstance();

    this.definitionDecorationType = vscode.window.createTextEditorDecorationType(
      defaultDecorationConfig.definitionStyle
    );

    this.referenceDecorationType = vscode.window.createTextEditorDecorationType(
      defaultDecorationConfig.outBlockReferenceStyle
    );

    this.activeEditor = vscode.window.activeTextEditor;
  }

  public static getInstance(): DecorationProvider {
    if (!DecorationProvider.instance) {
      DecorationProvider.instance = new DecorationProvider();
    }
    return DecorationProvider.instance;
  }

  public activate(context: vscode.ExtensionContext): void {
    this.logger.debug('DecorationProvider::Activating decoration provider');

    if (this.activeEditor) {
      this.triggerUpdateDecorations();
    }

    // Register event handlers
    context.subscriptions.push(
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (editor?.document.uri.scheme !== 'file') {
          return;
        }

        this.logger.debug('Decoration provider::Active editor changed', {
          uri: editor?.document.uri.toString(),
          languageId: editor?.document.languageId,
        });

        this.activeEditor = editor;
        if (editor) {
          this.triggerUpdateDecorations();
        }
      }),

      vscode.workspace.onDidChangeTextDocument((event) => {
        if (event.document.uri.scheme !== 'file') {
          return;
        }

        if (this.activeEditor && event.document === this.activeEditor.document) {
          this.logger.debug('Decoration provider::Document changed', {
            uri: event.document.uri.toString(),
            changes: event.contentChanges.length,
          });
          this.triggerUpdateDecorations();
        }
      })
    );

    this.logger.debug('Decoration provider::Decoration provider activated');
  }

  public triggerUpdateDecorations(): void {
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = undefined;
    }
    this.timeout = setTimeout(() => this.updateDecorations(), 500);
  }

  private async updateDecorations(): Promise<void> {
    if (!this.activeEditor || this.activeEditor.document.languageId !== LANGUAGE.ID) {
      this.logger.debug(
        'Decoration provider::Skipping decoration update for non-markdown document',
        {
          uri: this.activeEditor?.document.uri.toString(),
          languageId: this.activeEditor?.document.languageId,
        }
      );
      return;
    }

    this.logger.debug('Decoration provider::Updating decorations', {
      uri: this.activeEditor.document.uri.toString(),
    });

    try {
      // Clear existing decorations
      this.activeEditor.setDecorations(this.definitionDecorationType, []);
      this.activeEditor.setDecorations(this.referenceDecorationType, []);

      const text = this.activeEditor.document.getText();

      // Use predefined patterns from constants
      const definitionMatches = Array.from(text.matchAll(PATTERNS.CODE_BLOCK));
      const referenceMatches = Array.from(text.matchAll(PATTERNS.ALL_REFERENCES));

      if (!definitionMatches.length && !referenceMatches.length) {
        this.logger.debug('Decoration provider::No matches found in document', {
          uri: this.activeEditor.document.uri.toString(),
        });
      }

      const definitionRanges: vscode.Range[] = [];
      const referenceRanges: vscode.Range[] = [];

      // Process definitions
      for (const match of definitionMatches) {
        const startPos = this.activeEditor.document.positionAt(match.index!);
        const endPos = this.activeEditor.document.positionAt(match.index! + match[0].length);
        definitionRanges.push(new vscode.Range(startPos, endPos));
      }

      // Process references
      for (const match of referenceMatches) {
        const startPos = this.activeEditor.document.positionAt(match.index!);
        const endPos = this.activeEditor.document.positionAt(match.index! + match[0].length);
        referenceRanges.push(new vscode.Range(startPos, endPos));
      }

      // Log any potential decoration issues
      if (definitionMatches.length !== definitionRanges.length) {
        this.logger.warn('Decoration provider::Mismatch in definition decorations', {
          matches: definitionMatches.length,
          ranges: definitionRanges.length,
        });
      }

      if (referenceMatches.length !== referenceRanges.length) {
        this.logger.warn('Decoration provider::Mismatch in reference decorations', {
          matches: referenceMatches.length,
          ranges: referenceRanges.length,
        });
      }

      // Apply decorations
      this.activeEditor.setDecorations(this.definitionDecorationType, definitionRanges);
      this.activeEditor.setDecorations(this.referenceDecorationType, referenceRanges);

      this.logger.debug('Decoration provider::Decorations updated', {
        uri: this.activeEditor.document.uri.toString(),
        definitions: definitionRanges.length,
        references: referenceRanges.length,
      });
    } catch (error) {
      this.logger.error(
        'Error updating decorations',
        error instanceof Error ? error : new Error(String(error)),
        {
          uri: this.activeEditor.document.uri.toString(),
        }
      );
    }
  }

  public dispose(): void {
    this.logger.debug('Decoration provider::Disposing decoration provider');
    this.definitionDecorationType.dispose();
    this.referenceDecorationType.dispose();
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = undefined;
    }
  }
}
