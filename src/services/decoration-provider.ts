import * as vscode from 'vscode';
import { DecorationConfig, defaultDecorationConfig } from '../config/decoration';

export class DecorationProvider {
    private static instance: DecorationProvider;
    private config: DecorationConfig;

    private definitionDecoration!: vscode.TextEditorDecorationType;
    private continuationDecoration!: vscode.TextEditorDecorationType;
    private inBlockRefDecoration!: vscode.TextEditorDecorationType;
    private outBlockRefDecoration!: vscode.TextEditorDecorationType;

    private constructor() {
        this.config = defaultDecorationConfig;
        this.createDecorationTypes();
    }

    public static getInstance(): DecorationProvider {
        if (!DecorationProvider.instance) {
            DecorationProvider.instance = new DecorationProvider();
        }
        return DecorationProvider.instance;
    }

    private createDecorationTypes(): void {
        this.definitionDecoration = vscode.window.createTextEditorDecorationType(this.config.definitionStyle);
        this.continuationDecoration = vscode.window.createTextEditorDecorationType(this.config.continuationStyle);
        this.inBlockRefDecoration = vscode.window.createTextEditorDecorationType(this.config.inBlockReferenceStyle);
        this.outBlockRefDecoration = vscode.window.createTextEditorDecorationType(this.config.outBlockReferenceStyle);
    }

    public updateDecorations(editor: vscode.TextEditor): void {
        const document = editor.document;
        if (document.languageId !== 'entangled-markdown') {
            return;
        }

        const text = document.getText();
        const definitionRanges: vscode.Range[] = [];
        const continuationRanges: vscode.Range[] = [];
        const inBlockRefRanges: vscode.Range[] = [];
        const outBlockRefRanges: vscode.Range[] = [];

        // Match code block headers with identifiers
        const codeBlockRegex = /```\{[^}]*?#([^\s}]+)[^}]*?\}/g;
        let match;
        let lastBlockEnd = 0;
        
        while ((match = codeBlockRegex.exec(text))) {
            const startPos = document.positionAt(match.index);
            const endPos = document.positionAt(match.index + match[0].length);
            const range = new vscode.Range(startPos, endPos);
            
            // Check if there's an unclosed code block before this one
            const textBefore = text.substring(lastBlockEnd, match.index);
            const blockCount = (textBefore.match(/```/g) || []).length;
            
            if (blockCount % 2 === 0) {
                // This is a new block definition
                definitionRanges.push(range);
            } else {
                // This is a continuation of a previous block
                continuationRanges.push(range);
            }
            
            lastBlockEnd = match.index + match[0].length;
        }

        // Match references
        const referenceRegex = /<<([^>]+)>>/g;
        while ((match = referenceRegex.exec(text))) {
            const startPos = document.positionAt(match.index);
            const endPos = document.positionAt(match.index + match[0].length);
            const range = new vscode.Range(startPos, endPos);

            // Find the nearest code block markers before this reference
            const textBefore = text.substring(0, match.index);
            const blockMarkers = textBefore.match(/```/g) || [];
            const isInCodeBlock = blockMarkers.length % 2 === 1;

            if (isInCodeBlock) {
                inBlockRefRanges.push(range);
            } else {
                outBlockRefRanges.push(range);
            }
        }

        // Apply decorations
        editor.setDecorations(this.definitionDecoration, definitionRanges);
        editor.setDecorations(this.continuationDecoration, continuationRanges);
        editor.setDecorations(this.inBlockRefDecoration, inBlockRefRanges);
        editor.setDecorations(this.outBlockRefDecoration, outBlockRefRanges);
    }

    public dispose(): void {
        this.definitionDecoration.dispose();
        this.continuationDecoration.dispose();
        this.inBlockRefDecoration.dispose();
        this.outBlockRefDecoration.dispose();
    }
}
