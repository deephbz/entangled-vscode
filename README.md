# EntangleD for Visual Studio Code

Transform your documentation into living code with EntangleD, a powerful literate programming extension for VSCode. Write your code inside Markdown files and get full IDE support including code navigation, symbol lookup, and real-time previews.

## ✨ Features

### 🔍 Smart Code Navigation
- **Jump to Definition**: Click through noweb references (`<<reference>>`) to instantly navigate to their definitions
- **Find All References**: Quickly find all usages of a code block across your documentation
- **Symbol Outline**: View and navigate all code blocks in your document through VSCode's Outline window
- **Rich Hover Information**: See the actual code content when hovering over references

### 📝 Markdown Integration
- **Native Support**: Works with standard Markdown files - no special file extensions needed
- **Code Block Recognition**: Automatically detects and processes EntangleD code blocks:
  ```markdown
  ``` {.python #hello-world}
  print("Hello, World!")
  ```

### 🎯 Designed for Literate Programming
- **Language Agnostic**: Works with any programming language supported by your VSCode installation
- **Seamless Integration**: Perfect companion to the EntangleD CLI tool for tangling and untangling code

## 🚀 Getting Started

1. Install the extension from the VSCode Marketplace
2. Install Pandoc (required for processing Markdown):
   ```bash
   # On Ubuntu/Debian
   apt-get install pandoc

   # On macOS
   brew install pandoc

   # On Windows (using Chocolatey)
   choco install pandoc
   ```
3. Open any Markdown file containing EntangleD code blocks
4. Start navigating and editing your literate programs with full IDE support!

## 🔧 Usage

EntangleD uses a simple and intuitive syntax for code blocks:

- **Referable Blocks**: Create reusable code snippets with identifiers
  ```markdown
  ``` {.python #function-name}
  def greet(name):
      return f"Hello, {name}!"
  ```
  ```

- **File Blocks**: Define target source files
  ```markdown
  ``` {.python file=src/main.py}
  from greetings import greet
  print(greet("World"))
  ```
  ```

- **References**: Use double angle brackets to reference other code blocks
  ```markdown
  <<function-name>>
  ```

## 📚 Learn More

- [EntangleD Documentation](https://entangled.github.io/) - Learn about literate programming with EntangleD
- [GitHub Repository](https://github.com/entangled/entangled.py/) - EntangleD CLI tool and core functionality
- [Extension Issues](https://github.com/yourusername/entangled-vscode/issues) - Report bugs or request features

## 🤝 Contributing

Found a bug? Have a feature request? We'd love to hear from you! Please visit our [GitHub repository](https://github.com/yourusername/entangled-vscode) to:

- Submit bug reports
- Propose new features
- Contribute code

## 📄 License

This extension is licensed under the GNU GPL License. See the [LICENSE](LICENSE) file for details.
