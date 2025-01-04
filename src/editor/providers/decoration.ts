import * as vscode from 'vscode';
import { LiterateManager } from '../../core/literate/manager';
import { Logger } from '../../utils/logger';

/**
 * Manages decorations for literate programming elements in the editor
 */
export class DecorationProvider {
    private static instance: DecorationProvider;
    private documentManager: LiterateManager;
    private logger: Logger;
    private definitionDecorationType: vscode.TextEditorDecorationType;
    private referenceDecorationType: vscode.TextEditorDecorationType;
    private activeEditor?: vscode.TextEditor;
    private timeout?: NodeJS.Timer;

    private constructor() {
        this.documentManager = LiterateManager.getInstance();
        this.logger = Logger.getInstance();

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
        if (this.activeEditor) {
            this.triggerUpdateDecorations();
        }

        vscode.window.onDidChangeActiveTextEditor(
            editor => {
                this.activeEditor = editor;
                if (editor) {
                    this.triggerUpdateDecorations();
                }
            },
            null,
            context.subscriptions
        );

        vscode.workspace.onDidChangeTextDocument(
            event => {
                if (this.activeEditor && event.document === this.activeEditor.document) {
                    this.triggerUpdateDecorations();
                }
            },
            null,
            context.subscriptions
        );
    }

    private triggerUpdateDecorations(): void {
        if (this.timeout) {
            clearTimeout(this.timeout);
            this.timeout = undefined;
        }
        this.timeout = setTimeout(() => this.updateDecorations(), 500);
    }

    private updateDecorations(): void {
        if (!this.activeEditor) {
            return;
        }

        const text = this.activeEditor.document.getText();
        const definitionRegex = /^```\s*\{[^}]*#([^\s\}]+)[^}]*\}/gm;
        const referenceRegex = /<<([^>]+)>>/g;

        const definitionRanges: vscode.Range[] = [];
        const referenceRanges: vscode.Range[] = [];

        let match;
        
        // Find definitions
        while ((match = definitionRegex.exec(text))) {
            const startPos = this.activeEditor.document.positionAt(match.index);
            const endPos = this.activeEditor.document.positionAt(match.index + match[0].length);
            definitionRanges.push(new vscode.Range(startPos, endPos));
        }

        // Find references
        while ((match = referenceRegex.exec(text))) {
            const startPos = this.activeEditor.document.positionAt(match.index);
            const endPos = this.activeEditor.document.positionAt(match.index + match[0].length);
            referenceRanges.push(new vscode.Range(startPos, endPos));
        }

        this.activeEditor.setDecorations(this.definitionDecorationType, definitionRanges);
        this.activeEditor.setDecorations(this.referenceDecorationType, referenceRanges);

        this.logger.debug('Updated decorations', {
            definitions: definitionRanges.length,
            references: referenceRanges.length
        });
    }

    public dispose(): void {
        this.definitionDecorationType.dispose();
        this.referenceDecorationType.dispose();
    }
}
