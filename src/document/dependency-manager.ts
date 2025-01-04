import { DocumentMap, CircularReference } from './types';
import { Logger } from '../utils/logger';

export class DependencyManager {
    private readonly logger: Logger;

    constructor() {
        this.logger = Logger.getInstance();
    }

    public updateDependencies(documents: DocumentMap): void {
        this.logger.debug('Updating document dependencies');
        
        // Clear existing dependents
        for (const blocks of Object.values(documents)) {
            for (const block of blocks) {
                block.dependents.clear();
            }
        }

        // Update dependents based on dependencies
        for (const blocks of Object.values(documents)) {
            for (const block of blocks) {
                for (const dep of block.dependencies) {
                    const depBlocks = documents[dep];
                    if (depBlocks) {
                        for (const depBlock of depBlocks) {
                            depBlock.dependents.add(block.identifier);
                            this.logger.debug('Added dependent', { 
                                identifier: block.identifier,
                                dependent: depBlock.identifier 
                            });
                        }
                    }
                }
            }
        }
        
        this.logger.debug('Dependencies updated successfully');
    }

    public findCircularReferences(documents: DocumentMap): CircularReference[] {
        this.logger.debug('Searching for circular references');
        const visited = new Set<string>();
        const recursionStack = new Set<string>();
        const cycles: CircularReference[] = [];

        const dfs = (identifier: string, path: string[] = []): void => {
            if (recursionStack.has(identifier)) {
                const cycleStart = path.indexOf(identifier);
                if (cycleStart !== -1) {
                    const cycle = {
                        path: path.slice(cycleStart),
                        start: identifier
                    };
                    cycles.push(cycle);
                    this.logger.warn('Found circular reference', { cycle });
                }
                return;
            }

            if (visited.has(identifier)) {
                return;
            }

            visited.add(identifier);
            recursionStack.add(identifier);
            path.push(identifier);

            const blocks = documents[identifier];
            if (blocks) {
                for (const block of blocks) {
                    for (const dep of block.dependencies) {
                        dfs(dep, [...path]);
                    }
                }
            }

            recursionStack.delete(identifier);
            path.pop();
        };

        for (const identifier of Object.keys(documents)) {
            if (!visited.has(identifier)) {
                dfs(identifier);
            }
        }

        this.logger.info('Circular reference search completed', { 
            cyclesFound: cycles.length 
        });
        return cycles;
    }
}
