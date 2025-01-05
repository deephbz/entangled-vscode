import * as vscode from 'vscode';
import { Logger } from '../../utils/logger';
import { LANGUAGE } from '../../utils/constants';
import { defaultDecorationConfig, DecorationConfig } from '../../config/decoration';
import { DocumentEntities, NoWebReference } from '../../core/literate/entities';
import { LiterateManager } from '../../core/literate/manager';

type DecorationTypes = {
  [K in keyof DecorationConfig]: vscode.TextEditorDecorationType;
};

/** Provides decorations for literate programming elements in the editor */
export class EntangledDecorationProvider implements vscode.Disposable {
  private static instance: EntangledDecorationProvider;
  private readonly logger = Logger.getInstance();
  private readonly manager = LiterateManager.getInstance();
  private readonly decorationTypes: DecorationTypes;

  private activeEditor?: vscode.TextEditor;
  private updateTimeout?: NodeJS.Timeout;

  private constructor() {
    // Initialize all decoration types from config
    this.decorationTypes = Object.entries(defaultDecorationConfig).reduce(
      (types, [key, style]) => ({
        ...types,
        [key]: vscode.window.createTextEditorDecorationType(style),
      }),
      {} as DecorationTypes
    );

    this.activeEditor = vscode.window.activeTextEditor;
  }

  public static getInstance(): EntangledDecorationProvider {
    if (!EntangledDecorationProvider.instance) {
      EntangledDecorationProvider.instance = new EntangledDecorationProvider();
    }
    return EntangledDecorationProvider.instance;
  }

  public activate(context: vscode.ExtensionContext): void {
    this.logger.debug('decoration::activate');

    context.subscriptions.push(
      vscode.window.onDidChangeActiveTextEditor(this.handleEditorChange.bind(this)),
      vscode.workspace.onDidChangeTextDocument(this.handleDocumentChange.bind(this)),
      this // Register self as disposable
    );

    if (this.activeEditor) {
      this.triggerUpdateDecorations();
    }

    this.logger.debug('decoration::activated');
  }

  private handleEditorChange = (editor?: vscode.TextEditor): void => {
    if (!editor || editor.document.uri.scheme !== 'file') {
      return;
    }

    this.logger.debug('decoration::editor-changed', {
      uri: editor.document.uri.toString(),
      languageId: editor.document.languageId,
    });

    this.activeEditor = editor;
    this.triggerUpdateDecorations();
  };

  private handleDocumentChange = (event: vscode.TextDocumentChangeEvent): void => {
    if (event.document.uri.scheme !== 'file' || !this.activeEditor || event.document !== this.activeEditor.document) {
      return;
    }

    this.logger.debug('decoration::document-changed', {
      uri: event.document.uri.toString(),
      changes: event.contentChanges.length,
    });

    this.triggerUpdateDecorations();
  };

  private triggerUpdateDecorations(): void {
    if (this.updateTimeout) {
      clearTimeout(this.updateTimeout);
    }
    this.updateTimeout = setTimeout(() => this.updateDecorations(), 500);
  }

  private async updateDecorations(): Promise<void> {
    if (!this.activeEditor || this.activeEditor.document.languageId !== LANGUAGE.ID) {
      this.logger.debug('decoration::skip-non-markdown', {
        uri: this.activeEditor?.document.uri.toString(),
        languageId: this.activeEditor?.document.languageId,
      });
      return;
    }

    const documentUri = this.activeEditor.document.uri.toString();

    this.logger.debug('decoration::update', { uri: documentUri });

    try {
      const entities = this.manager.getDocumentEntities(documentUri);
      if (!entities) {
        return;
      }

      const decorations = this.createDecorations(entities);

      // Apply all decoration types
      Object.entries(this.decorationTypes).forEach(([key, decorationType]) => {
        const ranges = decorations[key as keyof DecorationTypes] || [];
        this.activeEditor!.setDecorations(decorationType, ranges);
      });

      this.logger.debug('decoration::updated', {
        uri: documentUri,
        decorationCounts: Object.fromEntries(Object.entries(decorations).map(([key, ranges]) => [key, ranges.length])),
      });
    } catch (error) {
      this.logger.error('decoration::update-error', error instanceof Error ? error : new Error(String(error)), {
        uri: documentUri,
      });
    }
  }

  private createDecorations(entities: DocumentEntities): Partial<Record<keyof DecorationTypes, vscode.Range[]>> {
    const decorations: Partial<Record<keyof DecorationTypes, vscode.Range[]>> = {
      definitionStyle: [],
      continuationStyle: [],
      inBlockReferenceStyle: [],
      outBlockReferenceStyle: [],
    };

    // Process code blocks
    Object.entries(entities.blocks).forEach(([_, blocks]) => {
      if (blocks.length > 0) {
        // First block gets definition style
        decorations.definitionStyle!.push(blocks[0].location.id_pos);
        // Subsequent blocks get continuation style
        blocks.slice(1).forEach((block) => {
          decorations.continuationStyle!.push(block.location.id_pos);
        });
      }
    });

    // Process references
    Object.values(entities.references)
      .flat()
      .forEach((ref: NoWebReference) => {
        if (ref.isInCodeBlock) {
          decorations.inBlockReferenceStyle!.push(ref.location.id_pos);
        } else {
          decorations.outBlockReferenceStyle!.push(ref.location.id_pos);
        }
      });

    return decorations;
  }

  public dispose(): void {
    this.logger.debug('decoration::dispose');
    Object.values(this.decorationTypes).forEach((type) => type.dispose());

    if (this.updateTimeout) {
      clearTimeout(this.updateTimeout);
      this.updateTimeout = undefined;
    }
  }
}
