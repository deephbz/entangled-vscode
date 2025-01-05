import * as vscode from 'vscode';

export interface DecorationConfig {
  definitionStyle: vscode.DecorationRenderOptions;
  continuationStyle: vscode.DecorationRenderOptions;
  inBlockReferenceStyle: vscode.DecorationRenderOptions;
  outBlockReferenceStyle: vscode.DecorationRenderOptions;
}

export const defaultDecorationConfig: DecorationConfig = {
  definitionStyle: {
    backgroundColor: { id: 'entangled.definition.background' },
    color: { id: 'entangled.definition.foreground' },
    fontStyle: 'bold italic',
    before: {
      contentText: '📝',
      margin: '0 4px 0 0',
    },
  },
  continuationStyle: {
    backgroundColor: { id: 'entangled.continuation.background' },
    color: { id: 'entangled.continuation.foreground' },
    fontStyle: 'bold italic',
    before: {
      contentText: '↪',
      margin: '0 4px 0 0',
    },
  },
  inBlockReferenceStyle: {
    backgroundColor: { id: 'entangled.inBlockRef.background' },
    color: { id: 'entangled.inBlockRef.foreground' },
    before: {
      contentText: '',
      margin: '0 2px 0 0',
    },
    after: {
      contentText: '',
      margin: '0 0 0 2px',
    },
  },
  outBlockReferenceStyle: {
    backgroundColor: { id: 'entangled.outBlockRef.background' },
    color: { id: 'entangled.outBlockRef.foreground' },
    before: {
      contentText: '',
      margin: '0 2px 0 0',
    },
    after: {
      contentText: '',
      margin: '0 0 0 2px',
    },
  },
};
