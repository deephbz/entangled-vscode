import * as vscode from 'vscode';
import { defaultDecorationConfig } from '../config/decoration';

export class DecorationProvider {
    private static instance: DecorationProvider;
    private definitionDecorationType: vscode.TextEditorDecorationType;
    private continuationDecorationType: vscode.TextEditorDecorationType;
    private inBlockRefDecorationType: vscode.TextEditorDecorationType;
    private outBlockRefDecorationType: vscode.TextEditorDecorationType;
    private referenceDecorationType: vscode.TextEditorDecorationType;

    private constructor() {
        this.definitionDecorationType = vscode.window.createTextEditorDecorationType({
            backgroundColor: new vscode.ThemeColor('entangled.definition.background'),
            color: new vscode.ThemeColor('entangled.definition.foreground'),
            rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
        });
        this.continuationDecorationType = vscode.window.createTextEditorDecorationType(defaultDecorationConfig.continuationStyle);
        this.inBlockRefDecorationType = vscode.window.createTextEditorDecorationType(defaultDecorationConfig.inBlockReferenceStyle);
        this.outBlockRefDecorationType = vscode.window.createTextEditorDecorationType(defaultDecorationConfig.outBlockReferenceStyle);
        this.referenceDecorationType = vscode.window.createTextEditorDecorationType({
            backgroundColor: new vscode.ThemeColor('entangled.reference.background'),
            color: new vscode.ThemeColor('entangled.reference.foreground'),
            rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
        });
    }

    public static getInstance(): DecorationProvider {
        if (!DecorationProvider.instance) {
            DecorationProvider.instance = new DecorationProvider();
        }
        return DecorationProvider.instance;
    }

    public updateDecorations(editor: vscode.TextEditor): void {
        if (editor.document.languageId !== 'entangled-markdown') {
            return;
        }

        const text = editor.document.getText();
        const definitionRanges: vscode.Range[] = [];
        const continuationRanges: vscode.Range[] = [];
        const inBlockRefRanges: vscode.Range[] = [];
        const outBlockRefRanges: vscode.Range[] = [];
        const referenceRanges: vscode.Range[] = [];

        // Find all definitions (#name)
        const defRegex = /(?<=^```\s*\{[^}]*#)([^\s}]+)(?=[^}]*\})/gm;
        let match;
        while ((match = defRegex.exec(text)) !== null) {
            const startPos = editor.document.positionAt(match.index);
            const endPos = editor.document.positionAt(match.index + match[1].length);
            definitionRanges.push(new vscode.Range(startPos, endPos));
        }

        // Match code block headers with identifiers
        const codeBlockRegex = /```\{[^}]*?#([^\s}]+)[^}]*?\}/g;
        let lastBlockEnd = 0;
        
        while ((match = codeBlockRegex.exec(text))) {
            const startPos = editor.document.positionAt(match.index);
            const endPos = editor.document.positionAt(match.index + match[0].length);
            const range = new vscode.Range(startPos, endPos);
            
            // Check if there's an unclosed code block before this one
            const textBefore = text.substring(lastBlockEnd, match.index);
            const blockCount = (textBefore.match(/```/g) || []).length;
            
            if (blockCount % 2 === 0) {
                // This is a new block definition
                // definitionRanges.push(range);
            } else {
                // This is a continuation of a previous block
                continuationRanges.push(range);
            }
            
            lastBlockEnd = match.index + match[0].length;
        }

        // Find all references (<<name>>)
        const refRegex = /<<([^>]+)>>/g;
        while ((match = refRegex.exec(text)) !== null) {
            const startPos = editor.document.positionAt(match.index);
            const endPos = editor.document.positionAt(match.index + match[0].length);
            referenceRanges.push(new vscode.Range(startPos, endPos));

            // Find the nearest code block markers before this reference
            const textBefore = text.substring(0, match.index);
            const blockMarkers = textBefore.match(/```/g) || [];
            const isInCodeBlock = blockMarkers.length % 2 === 1;

            if (isInCodeBlock) {
                inBlockRefRanges.push(new vscode.Range(startPos, endPos));
            } else {
                outBlockRefRanges.push(new vscode.Range(startPos, endPos));
            }
        }

        editor.setDecorations(this.definitionDecorationType, definitionRanges);
        editor.setDecorations(this.continuationDecorationType, continuationRanges);
        editor.setDecorations(this.inBlockRefDecorationType, inBlockRefRanges);
        editor.setDecorations(this.outBlockRefDecorationType, outBlockRefRanges);
        editor.setDecorations(this.referenceDecorationType, referenceRanges);
    }

    public dispose(): void {
        this.definitionDecorationType.dispose();
        this.continuationDecorationType.dispose();
        this.inBlockRefDecorationType.dispose();
        this.outBlockRefDecorationType.dispose();
        this.referenceDecorationType.dispose();
    }
}
