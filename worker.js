/**
 * Web Worker for processing files and generating markdown
 */

// Function to parse .gitignore content into an array of patterns
function parseGitignore(content) {
    if (!content) return [];
    
    return content
        .split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('#') && line !== '');
}

// Function to parse any ignore file content into an array of patterns
function parseIgnoreFile(content) {
    if (!content) return [];
    
    return content
        .split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('#') && line !== '');
}

// Function to test if a path matches an ignore pattern
function matchesIgnorePattern(path, pattern) {
    // Convert gitignore glob pattern to JavaScript RegExp
    // 1. Escape regex-special chars EXCEPT gitignore glob chars: * ? [ ] /
    let regexPattern = pattern
        .replace(/[.+^${}()|\\]/g, "\\$&") // escape . + ^ $ { } ( ) | and backslash but NOT * ? [ ] or /
        // Handle gitignore specific patterns
        .replace(/\*/g, ".*")  // * matches any string
        .replace(/\?/g, ".")   // ? matches a single character
        .replace(/\//g, "\\/"); // / is a directory separator

    // Add start/end anchors depending on pattern format
    if (pattern.startsWith("/")) {
        // Pattern with / at the beginning matches from the root
        regexPattern = `^${regexPattern.substring(1)}`;
    } else if (pattern.includes("/")) {
        // Pattern with / inside matches relative to root (any depth)
        regexPattern = `^.*${regexPattern}`;
    } else {
        // Pattern without / matches any file/dir with that name
        regexPattern = `(^|\\/)${regexPattern}($|\\/)`;
    }

    const regex = new RegExp(regexPattern, "i"); // case-insensitive to simplify patterns like [Dd]ebug
    return regex.test(path);
}

// Function to check if a file should be ignored based on gitignore patterns
function shouldIgnoreFile(path, ignorePatterns) {
    // Normalize path for consistent matching
    const normalizedPath = path.replace(/\\/g, '/');
    
    // Always ignore .git directory and its contents
    if (normalizedPath.includes('/.git/') || normalizedPath === '.git' || normalizedPath.startsWith('.git/')) {
        return true;
    }
    
    // Always ignore the generated files with the pattern llm-generated-*.md
    if (/llm-generated-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.md$/.test(normalizedPath)) {
        return true;
    }
    
    // Check against ignore patterns if any
    if (ignorePatterns && ignorePatterns.length > 0) {
        return ignorePatterns.some(pattern => matchesIgnorePattern(normalizedPath, pattern));
    }
    
    return false;
}

// Function to read file as text
function readFileAsText(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            resolve({ content: event.target.result, error: null });
        };
        reader.onerror = (event) => {
            console.error("File could not be read! Code " + event.target.error.code, event.target.error);
            resolve({ content: '', error: event.target.error.message || 'Unknown read error' });
        };
        reader.readAsText(file);
    });
}

// Extract folder name from the first file's path
function extractFolderName(files) {
    if (!files || files.length === 0) {
        return 'merged_output';
    }

    // Try to get the folder name from the first file's relative path
    const firstFilePath = files[0].webkitRelativePath;
    if (firstFilePath && firstFilePath.includes('/')) {
        return firstFilePath.substring(0, firstFilePath.indexOf('/'));
    }
    
    return 'selected_folder_output';
}

// Default template if none is provided from UI
const FALLBACK_TEMPLATE = `# Merged Content from Folder: {{FOLDER_NAME}}

{{ALL_FILES}}
`;

// Process the template and replace variables
function processTemplate(template, variables) {
    let result = template;
    for (const [key, value] of Object.entries(variables)) {
        const placeholder = new RegExp(`{{${key}}}`, 'g');
        result = result.replace(placeholder, value || ''); // Ensure value is not null/undefined
    }
    return result;
}

// Generate timestamp for filename
function getTimestampForFilename() {
    const now = new Date();
    return now.toISOString()
        .replace(/:/g, '-')
        .replace(/\\..+/, '');
}

// Function to determine if a file is binary based on MIME type or common extensions
function isBinaryFile(file) {
    // If the browser supplies a MIME type and it's not text/* treat as binary
    if (file.type && !file.type.startsWith('text')) {
        return true;
    }

    // Fallback to extension check for when MIME type is missing (e.g. when using webkitRelativePath)
    const binaryExtensions = [
        '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.svg', '.webp', '.ico',
        '.pdf', '.zip', '.gz', '.tar', '.rar', '.7z', '.exe', '.dll', '.so',
        '.mp3', '.mp4', '.wav', '.ogg', '.webm', '.mov', '.avi', '.bin'
    ];
    return binaryExtensions.some(ext => file.name.toLowerCase().endsWith(ext));
}

// Determine a safe Markdown fence
function getSafeCodeFence(content) {
    if (typeof content !== 'string') content = ''; // Ensure content is a string
    const matches = content.match(/`{3,}/g);
    const longestFence = matches ? Math.max(...matches.map(m => m.length)) : 0; // Default to 0 if no matches
    return '`'.repeat(Math.max(3, longestFence + 1)); // Ensure at least ```
}

// Main function to process files
async function processFiles(filesData, templateVariables = {}, mergeTemplate = null) {
    try {
        const startTime = performance.now();
        
        let folderName = "selected_files"; 
        if (filesData && filesData.length > 0 && filesData[0].relativePath) {
            const firstPathParts = filesData[0].relativePath.split('/');
            if (firstPathParts.length > 0 && firstPathParts[0] !== filesData[0].relativePath) { // Check if it's actually a path
                folderName = firstPathParts[0];
            } else if (filesData[0].name) { // if relativePath is just the filename
                 folderName = filesData[0].name.split('.')[0] + "_content";
            }
        } else if (filesData && filesData.length > 0 && filesData[0].name) {
            folderName = filesData[0].name.split('.')[0] + "_content"; 
        }

        const timestamp = getTimestampForFilename();
        const outputFilename = `llm-generated-${timestamp}.md`;

        self.postMessage({ type: 'status', message: 'Processing selected files...' });
        let filesContent = '';
        
        const totalFiles = filesData.length;
        let processedCount = 0;

        self.postMessage({ type: 'progress', processed: 0, total: totalFiles, percent: 0 });

        filesData.sort((a, b) => (a.relativePath || a.name).localeCompare(b.relativePath || b.name));

        for (const fileDetail of filesData) {
            const path = fileDetail.relativePath || fileDetail.name;
            filesContent += `## ${path}\\n\\n`; // Double newline after header
            if (fileDetail.error) {
                filesContent += `\`\`\`text\\nError reading file: ${fileDetail.content}\\n\`\`\`\\n\\n`;
            } else {
                const fileActualContent = fileDetail.content || '';
                const fence = getSafeCodeFence(fileActualContent);
                filesContent += `${fence}\\n${fileActualContent}\\n${fence}\\n\\n`;
            }
            processedCount++;
            const percent = totalFiles > 0 ? Math.round((processedCount / totalFiles) * 100) : 0;
            self.postMessage({
                type: 'progress',
                processed: processedCount,
                total: totalFiles,
                percent: percent
            });
        }
        
        let templateToUse = mergeTemplate || FALLBACK_TEMPLATE;

        const currentDate = new Date();
        const variables = {
            FOLDER_NAME: folderName, 
            DATE: currentDate.toLocaleDateString(),
            TIME: currentDate.toLocaleTimeString(),
            ALL_FILES: filesContent,
            ...templateVariables
        };
        const mdContent = processTemplate(templateToUse, variables);

        const endTime = performance.now();
        const processingTime = ((endTime - startTime) / 1000).toFixed(2);

        self.postMessage({ 
            type: 'result', 
            markdown: mdContent, 
            selectedFolderName: folderName, 
            outputFilename: outputFilename,
            stats: {
                processed: processedCount,
                ignored: 0, 
                gitIgnored: 0,
                generatedIgnored: 0,
                total: totalFiles, 
                time: processingTime,
            }
        });

    } catch (error) {
        console.error("Error in worker processFiles:", error);
        self.postMessage({ 
            type: 'error', 
            message: error.message || 'Unknown error during processing' 
        });
    }
}

// Listen for messages from the main thread
self.addEventListener('message', async function(e) {
    const { filesData, templateVariables, mergeTemplate } = e.data;
    
    if (filesData) {
        await processFiles(filesData, templateVariables || {}, mergeTemplate);
    } else {
        self.postMessage({ type: 'error', message: 'No file data received by worker' });
    }
});

// Ensure getSafeCodeFence, processTemplate, FALLBACK_TEMPLATE, getTimestampForFilename are defined in worker context
// (They seem to be there already based on the provided worker.js or need to be confirmed)
// Functions like parseIgnoreFile, matchesIgnorePattern, shouldIgnoreFile, readFileAsText, extractFolderName, isBinaryFile are no longer needed here
// if all filtering and reading happens on main thread.

// Keep utility functions that are still used:
// processTemplate, getTimestampForFilename, getSafeCodeFence, FALLBACK_TEMPLATE
 