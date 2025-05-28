# LLM System Instruct Generator

A powerful browser-based tool for merging multiple files into a single markdown document, specifically designed for Large Language Model (LLM) workflows. This tool helps developers and researchers prepare comprehensive code bases and documentation for LLM analysis by intelligently combining files while respecting ignore patterns.

## ✨ Features

- **🌐 Browser-Based**: No installation required - runs entirely in your browser
- **📁 Folder Selection**: Use the modern File System Access API to select entire project folders
- **🎯 Smart File Filtering**: Supports `.gitignore` and `.llmignore` patterns to exclude unwanted files
- **📝 Template System**: Customizable markdown templates with variable substitution
- **⚡ Web Worker Processing**: Non-blocking file processing for large projects
- **💾 Persistent Settings**: Remembers your file selections and folder access between sessions
- **📊 Progress Tracking**: Real-time progress indicators for large file operations
- **🔧 Customizable Variables**: Add custom template variables for flexible output formatting
- **📤 Easy Export**: Download generated markdown files directly to your computer

## 🚀 Quick Start

### Online Usage (Recommended)

1. **Open in Browser**: Visit the hosted version or open `index.html` in a modern browser
2. **Grant Folder Access**: Click "Open Folder" and select your project directory
3. **Select Files**: Use the file explorer to choose which files to include
4. **Customize Template**: Modify the merge template and add custom variables as needed
5. **Generate**: Click "Process Files & Generate MD" to create your merged markdown file
6. **Download**: Save the generated file to your computer

### Local Development

```bash
# Clone the repository
git clone https://github.com/PahVenture/llm-system-instruct-generator.git
cd llm-system-instruct-generator

# Serve locally (Python 3)
python -m http.server 8000

# Or using Node.js
npx http-server

# Open http://localhost:8000 in your browser
```

## 🌍 Browser Compatibility

This tool requires browsers that support the **File System Access API**:

- ✅ **Chrome/Chromium** 86+
- ✅ **Edge** 86+
- ✅ **Opera** 72+
- ❌ **Firefox** (not supported yet)
- ❌ **Safari** (not supported yet)

For unsupported browsers, a fallback notice will be displayed.

## 📖 Usage Guide

### File Selection and Filtering

The tool automatically respects common ignore patterns:

1. **`.gitignore`** - Standard Git ignore patterns
2. **`.llmignore`** - Custom patterns for LLM workflows (similar syntax to .gitignore)

### Template Variables

Built-in variables available in templates:

- `{{SYSTEM_PROMPT}}` - Content from systemp_prompt.md
- `{{DATE}}` - Current date
- `{{TIME}}` - Current time  
- `{{FOLDER_NAME}}` - Selected folder name
- `{{ALL_FILES}}` - Combined content of all selected files

### Custom Variables

Add your own template variables using the interface:

1. Click "+ Add Custom Variable"
2. Enter variable name and value
3. Use `{{YOUR_VARIABLE}}` in templates

### Example Template

```markdown
{{SYSTEM_PROMPT}}

Project: {{FOLDER_NAME}}
Generated: {{DATE}} at {{TIME}}

## Files Content

{{ALL_FILES}}
```

## 📁 Project Structure

```
llm-system-instruct-generator/
├── index.html              # Main application interface
├── app.js                  # Core application logic
├── worker.js               # Web worker for file processing
├── dbManager.js            # IndexedDB for persistent storage
├── systemp_prompt.md       # Default system prompt template
├── merged.template.md      # Default merge template
├── .gitignore             # Git ignore patterns
├── .llmignore             # LLM-specific ignore patterns
└── README.md              # This file
```

## 🔧 Configuration Files

### System Prompt (`systemp_prompt.md`)

Contains the default system prompt used in generated outputs. This file defines how the LLM should interpret and work with the merged content.

### Merge Template (`merged.template.md`)

The default template structure for combined files. Customize this to change how your merged content is formatted.

### Ignore Files

- **`.gitignore`**: Standard Git patterns (automatically respected)
- **`.llmignore`**: Additional patterns specific to LLM workflows

## 🤝 Contributing

We welcome contributions! Here's how to get started:

### Development Setup

1. Fork the repository
2. Clone your fork locally
3. Create a feature branch: `git checkout -b feature/amazing-feature`
4. Make your changes
5. Test thoroughly in supported browsers
6. Commit with clear messages: `git commit -m 'Add amazing feature'`
7. Push to your branch: `git push origin feature/amazing-feature`
8. Open a Pull Request

### Code Style

- Use modern JavaScript (ES6+)
- Follow existing code formatting
- Add comments for complex logic
- Ensure browser compatibility with target browsers

### Testing

- Test all features in Chrome/Chromium
- Verify File System Access API functionality
- Test with various project structures and file types
- Ensure error handling works correctly

## 🐛 Troubleshooting

### Common Issues

**"Browser not supported" message**
- Use Chrome, Edge, or Opera (86+)
- Ensure File System Access API is enabled

**Folder access lost after refresh**
- This is normal - grant access again
- Consider bookmarking frequently used projects

**Large files processing slowly**
- The tool uses Web Workers for non-blocking processing
- Progress is shown in real-time
- Consider using `.llmignore` to exclude large binary files

**Files not appearing in tree**
- Check if files match ignore patterns
- Verify folder permissions
- Try refreshing folder access

### Performance Tips

1. Use `.llmignore` to exclude unnecessary files
2. Avoid selecting folders with large binary assets
3. Process files in smaller batches for very large projects
4. Clear browser storage if experiencing issues

## 📄 License

This project is open source. Please check the repository for specific license terms.

## 🙏 Acknowledgments

- Built using modern Web APIs
- Inspired by the need for better LLM workflow tools
- Thanks to all contributors and users providing feedback

## 🔗 Links

- [Repository](https://github.com/PahVenture/llm-system-instruct-generator)
- [Issues](https://github.com/PahVenture/llm-system-instruct-generator/issues)
- [File System Access API Documentation](https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API)

---

**Made with ❤️ for the LLM and developer community**
