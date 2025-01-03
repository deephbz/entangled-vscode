export interface CodeBlockProperty {
    type: 'identifier' | 'class' | 'keyValue';
    key: string;
    value?: string;
}

export interface CodeBlockAttributes {
    properties: CodeBlockProperty[];
    language?: string;
    identifier?: string;
    fileName?: string;
}

export type CodeBlockType = 'referable' | 'file' | 'ignored';

export interface PandocCodeBlock {
    type: CodeBlockType;
    identifier: string;
    language: string;
    content: string;
    references: string[];
    lineNumber: number;
    fileName?: string;
    indentation?: string;
    attributes: CodeBlockAttributes;
}

export interface PandocASTNode {
    t: string;  // type
    c: any;     // content
}

export interface PandocAST {
    blocks: PandocASTNode[];
    meta: Record<string, any>;
    pandoc_version: string[];
}
