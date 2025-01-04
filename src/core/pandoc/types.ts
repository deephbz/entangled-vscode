export interface PandocCodeBlock {
    identifier: string;
    language: string;
    content: string;
    references: string[];
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
