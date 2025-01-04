import * as vscode from 'vscode';

export const defaultConfig = {
    // Decoration settings
    decorationStyles: {
        definition: vscode.window.createTextEditorDecorationType({
            backgroundColor: 'rgba(100, 100, 100, 0.3)'
        }),
        reference: vscode.window.createTextEditorDecorationType({
            backgroundColor: 'rgba(100, 100, 100, 0.2)'
        })
    },
    
    // Parser settings
    parser: {
        maxBlockSize: 1000000, // 1MB
        cacheTimeout: 5000     // 5 seconds
    },

    // Performance settings
    performance: {
        debounceInterval: 300  // ms
    }
};
