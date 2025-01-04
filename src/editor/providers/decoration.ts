import * as vscode from 'vscode';
import { Logger } from '../../utils/logger';
import { ILiterateManager } from '../../core/literate/manager';
import { LiteratePatterns } from '../../core/literate/patterns';
import { LANGUAGE } from '../../utils/constants';
import { CodeBlockType } from '../../core/literate/types';

/**
 * Manages decorations for literate programming elements in the editor
 */
export class DecorationProvider {
    private static instance: DecorationProvider;
    private logger: Logger;
    private definitionDecorationType: vscode.TextEditorDecorationType;
    private referenceDecorationType: vscode.TextEditorDecorationType;
    private activeEditor?: vscode.TextEditor;
    private timeout?: NodeJS.Timeout;
    private literateManager: ILiterateManager;

    private constructor() {
        this.logger = Logger.getInstance();
        this.literateManager = ILiterateManager.getInstance();

        this.definitionDecorationType = vscode.window.createTextEditorDecorationType({
            backgroundColor: { id: 'entangled.definitionBackground' },
            borderWidth: '1px',
            borderStyle: 'solid',
            borderColor: { id: 'entangled.definitionBorder' },
            overviewRulerColor: { id: 'entangled.definitionRuler' },
            overviewRulerLane: vscode.OverviewRulerLane.Right
        });

        this.referenceDecorationType = vscode.window.createTextEditorDecorationType({
            backgroundColor: { id: 'entangled.referenceBackground' },
            borderWidth: '1px',
            borderStyle: 'solid',
            borderColor: { id: 'entangled.referenceBorder' },
            overviewRulerColor: { id: 'entangled.referenceRuler' },
            overviewRulerLane: vscode.OverviewRulerLane.Right
        });

        this.activeEditor = vscode.window.activeTextEditor;
    }

    public static getInstance(): DecorationProvider {
        if (!DecorationProvider.instance) {
            DecorationProvider.instance = new DecorationProvider();
        }
        return DecorationProvider.instance;
    }

    public activate(context: vscode.ExtensionContext): void {
        this.logger.debug('Activating decoration provider');

        if (this.activeEditor) {
            this.triggerUpdateDecorations();
        }

        // Register event handlers
        context.subscriptions.push(
            vscode.window.onDidChangeActiveTextEditor(editor => {
                if (editor?.document.uri.scheme !== 'file') {
                    return;
                }
                
                this.logger.debug('Active editor changed', {
                    uri: editor?.document.uri.toString(),
                    languageId: editor?.document.languageId
                });
                
                this.activeEditor = editor;
                if (editor) {
                    this.triggerUpdateDecorations();
                }
            }),

            vscode.workspace.onDidChangeTextDocument(event => {
                if (event.document.uri.scheme !== 'file') {
                    return;
                }
                
                if (this.activeEditor && event.document === this.activeEditor.document) {
                    this.logger.debug('Document changed', {
                        uri: event.document.uri.toString(),
                        changes: event.contentChanges.length
                    });
                    this.triggerUpdateDecorations();
                }
            })
        );

        this.logger.debug('Decoration provider activated');
    }

    public triggerUpdateDecorations(): void {
        if (this.timeout) {
            clearTimeout(this.timeout);
            this.timeout = undefined;
        }
        this.timeout = setTimeout(() => this.updateDecorations(), 500);
    }

    private async updateDecorations(): Promise<void> {
        if (!this.activeEditor) {
            return;
        }

        const document = this.activeEditor.document;
        const text = document.getText();
        const definitionRanges: vscode.Range[] = [];
        const referenceRanges: vscode.Range[] = [];
        let match;

        try {
            // Find and decorate code block definitions
            while ((match = LiteratePatterns.codeBlockDefinition.exec(text))) {
                const attributes = match[1];
                const properties = this.literateManager.parseCodeBlockProperties(attributes);
                
                if (properties.type === CodeBlockType.Referable || properties.type === CodeBlockType.File) {
                    const startPos = document.positionAt(match.index);
                    const endPos = document.positionAt(match.index + match[0].length);
                    definitionRanges.push(new vscode.Range(startPos, endPos));
                }
            }

            // Find and decorate code block references
            while ((match = LiteratePatterns.codeBlockReference.exec(text))) {
                const startPos = document.positionAt(match.index);
                const endPos = document.positionAt(match.index + match[0].length);
                referenceRanges.push(new vscode.Range(startPos, endPos));
            }

            // Apply decorations
            this.activeEditor.setDecorations(this.definitionDecorationType, definitionRanges);
            this.activeEditor.setDecorations(this.referenceDecorationType, referenceRanges);

            this.logger.debug('Decorations updated', {
                definitions: definitionRanges.length,
                references: referenceRanges.length
            });
        } catch (error) {
            this.logger.error('Error updating decorations',
                error instanceof Error ? error : new Error(String(error))
            );
        }
    }

    public dispose(): void {
        this.logger.debug('Disposing decoration provider');
        this.definitionDecorationType.dispose();
        this.referenceDecorationType.dispose();
        if (this.timeout) {
            clearTimeout(this.timeout);
            this.timeout = undefined;
        }
    }
}
