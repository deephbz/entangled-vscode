import { PandocCodeBlock } from '../pandoc/types';
import * as vscode from 'vscode';

export interface CodeBlockLocation {
    uri: vscode.Uri;
    range: vscode.Range;
    identifier: string;
}

export interface DocumentBlock extends PandocCodeBlock {
    location: CodeBlockLocation;
    expandedContent?: string;
    dependencies: Set<string>;
    dependents: Set<string>;
}

export interface DocumentMap {
    [identifier: string]: DocumentBlock[];
}

export interface FileMap {
    [uri: string]: Set<string>;  // URI -> Set of block identifiers
}

export interface CircularReference {
    path: string[];
    start: string;
}
