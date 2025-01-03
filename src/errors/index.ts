export class EntangledError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'EntangledError';
        Object.setPrototypeOf(this, EntangledError.prototype);
    }
}

export class DocumentParseError extends EntangledError {
    constructor(message: string, public readonly uri: string) {
        super(`Failed to parse document ${uri}: ${message}`);
        this.name = 'DocumentParseError';
        Object.setPrototypeOf(this, DocumentParseError.prototype);
    }
}

export class BlockNotFoundError extends EntangledError {
    constructor(public readonly identifier: string) {
        super(`Block with identifier "${identifier}" not found`);
        this.name = 'BlockNotFoundError';
        Object.setPrototypeOf(this, BlockNotFoundError.prototype);
    }
}

export class CircularDependencyError extends EntangledError {
    constructor(public readonly path: string[]) {
        super(`Circular dependency detected: ${path.join(' -> ')}`);
        this.name = 'CircularDependencyError';
        Object.setPrototypeOf(this, CircularDependencyError.prototype);
    }
}
