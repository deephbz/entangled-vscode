import * as vscode from 'vscode';
import { defaultConfig } from './defaults';

export class Settings {
  private static instance: Settings;
  private constructor() {}

  static getInstance(): Settings {
    if (!Settings.instance) {
      Settings.instance = new Settings();
    }
    return Settings.instance;
  }

  getConfiguration() {
    const config = vscode.workspace.getConfiguration('entangled');
    return {
      ...defaultConfig,
      decorationStyles: {
        ...defaultConfig.decorationStyles,
        // Add any user-configurable decoration styles here
      },
      parser: {
        ...defaultConfig.parser,
        maxBlockSize: config.get('parser.maxBlockSize', defaultConfig.parser.maxBlockSize),
        cacheTimeout: config.get('parser.cacheTimeout', defaultConfig.parser.cacheTimeout),
      },
      performance: {
        ...defaultConfig.performance,
        debounceInterval: config.get(
          'performance.debounceInterval',
          defaultConfig.performance.debounceInterval
        ),
      },
    };
  }
}
