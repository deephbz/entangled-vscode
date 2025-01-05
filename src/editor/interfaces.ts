import * as vscode from 'vscode';
import { CircularReference } from '../core/literate/entities';

/** Interface for document management operations in the editor */
export interface IDocumentManager {
  parseDocument(document: vscode.TextDocument): Promise<void>;
  findDefinition(identifier: string): vscode.Location[];
  findReferences(identifier: string): vscode.Location[];
  findCircularReferences(): CircularReference[];
  getExpandedContent(identifier: string): string;
  clearCache(): void;
}
