/**
 * Base error class for all EntangleD errors
 */
export class EntangledError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'EntangledError';
        Object.setPrototypeOf(this, EntangledError.prototype);
    }
}

/**
 * Error thrown when document parsing fails
 */
export class DocumentParseError extends EntangledError {
    constructor(message: string, public readonly uri: string) {
        super(`Failed to parse document ${uri}: ${message}`);
        this.name = 'DocumentParseError';
        Object.setPrototypeOf(this, DocumentParseError.prototype);
    }
}

/**
 * Error thrown when a referenced block is not found
 */
export class BlockNotFoundError extends EntangledError {
    constructor(public readonly identifier: string) {
        super(`Block with identifier "${identifier}" not found`);
        this.name = 'BlockNotFoundError';
        Object.setPrototypeOf(this, BlockNotFoundError.prototype);
    }
}

/**
 * Error thrown when a circular dependency is detected
 */
export class CircularDependencyError extends EntangledError {
    constructor(public readonly path: string[]) {
        super(`Circular dependency detected: ${path.join(' -> ')}`);
        this.name = 'CircularDependencyError';
        Object.setPrototypeOf(this, CircularDependencyError.prototype);
    }
}

/**
 * Error thrown when Pandoc operations fail
 */
export class PandocError extends EntangledError {
    constructor(message: string, public readonly stderr: string) {
        super(`Pandoc error: ${message}\nDetails: ${stderr}`);
        this.name = 'PandocError';
        Object.setPrototypeOf(this, PandocError.prototype);
    }
}
