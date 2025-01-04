/**
 * Base error class for EntangleD extension
 */
export class EntangledError extends Error {
    constructor(message: string) {
        super(message);
        this.name = this.constructor.name;
        Error.captureStackTrace(this, this.constructor);
    }
}

/**
 * Error thrown when Pandoc execution fails
 */
export class PandocError extends EntangledError {
    constructor(message: string, public readonly stderr?: string) {
        super(message);
        if (stderr) {
            this.message += `\nPandoc output: ${stderr}`;
        }
    }
}

/**
 * Error thrown when document parsing fails
 */
export class DocumentParseError extends EntangledError {
    constructor(
        message: string,
        public readonly documentUri: string,
        public readonly lineNumber?: number
    ) {
        super(message);
        if (lineNumber !== undefined) {
            this.message += ` at line ${lineNumber}`;
        }
        this.message += ` in ${documentUri}`;
    }
}

/**
 * Error thrown when a circular reference is detected
 */
export class CircularReferenceError extends EntangledError {
    constructor(
        message: string,
        public readonly identifiers: string[]
    ) {
        super(message);
        this.message += `\nCircular reference chain: ${identifiers.join(' -> ')}`;
    }
}

/**
 * Error thrown when a referenced block is not found
 */
export class BlockNotFoundError extends EntangledError {
    constructor(
        public readonly identifier: string,
        public readonly documentUri?: string
    ) {
        super(`Code block not found: ${identifier}${documentUri ? ` in ${documentUri}` : ''}`);
    }
}

/**
 * Error thrown when there's a syntax error in a code block
 */
export class BlockSyntaxError extends EntangledError {
    constructor(
        message: string,
        public readonly blockIdentifier: string,
        public readonly lineNumber?: number
    ) {
        super(`Syntax error in block '${blockIdentifier}': ${message}${lineNumber ? ` at line ${lineNumber}` : ''}`);
    }
}
