import { DocumentMap } from './types';
import { Logger } from '../services/logger';
import { BlockNotFoundError, CircularDependencyError } from '../errors';
import { DependencyManager } from './dependency-manager';

export class ContentExpander {
    private logger: Logger;
    private dependencyManager: DependencyManager;

    constructor() {
        this.logger = Logger.getInstance();
        this.dependencyManager = new DependencyManager();
    }

    public expandContent(identifier: string, documents: DocumentMap): string {
        const blocks = documents[identifier];
        if (!blocks?.length) {
            throw new BlockNotFoundError(identifier);
        }

        const cycles = this.dependencyManager.findCircularReferences(documents);
        if (cycles.length > 0) {
            throw new CircularDependencyError(cycles[0].path);
        }

        return this.expand(identifier, documents);
    }

    private expand(id: string, documents: DocumentMap, visited: Set<string> = new Set()): string {
        if (visited.has(id)) {
            this.logger.warn('Circular reference detected during expansion', { identifier: id });
            return `<<circular reference to ${id}>>`;
        }

        const blocks = documents[id];
        if (!blocks?.length) {
            this.logger.warn('Block not found during expansion', { identifier: id });
            return `<<${id} not found>>`;
        }

        visited.add(id);
        let content = '';
        
        for (const block of blocks) {
            content += block.content.replace(/<<([^>]+)>>/g, (_, ref) => {
                return this.expand(ref, documents, new Set(visited));
            });
            content += '\n';
        }

        visited.delete(id);
        return content;
    }
}
