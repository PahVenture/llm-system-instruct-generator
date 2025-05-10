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

// Function to test if a path matches a gitignore pattern
function matchesGitignorePattern(path, pattern) {
    // Convert gitignore glob pattern to JavaScript RegExp
    let regexPattern = pattern
        // Escape special regex characters except those used in gitignore patterns
        .replace(/[.+^${}()|[\]]/g, '\\$&')
        // Handle gitignore specific patterns
        .replace(/\*/g, '.*')  // * matches any string
        .replace(/\?/g, '.')   // ? matches a single character
        .replace(/\//g, '\\/'); // / is a directory separator

    // Add start/end anchors depending on pattern format
    if (pattern.startsWith('/')) {
        // Pattern with / at the beginning matches from the root
        regexPattern = `^${regexPattern.substring(1)}`;
    } else if (pattern.includes('/')) {
        // Pattern with / inside matches relative to root
        regexPattern = `^.*${regexPattern}`;
    } else {
        // Pattern without / matches any file/dir with that name
        regexPattern = `^.*\\/${regexPattern}$|^${regexPattern}$`;
    }

    const regex = new RegExp(regexPattern);
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
    
    // Check against gitignore patterns if any
    if (ignorePatterns && ignorePatterns.length > 0) {
        return ignorePatterns.some(pattern => matchesGitignorePattern(normalizedPath, pattern));
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

// Default template in case the template file is not provided
const DEFAULT_TEMPLATE = `# Merged Content from Folder: {{FOLDER_NAME}}

{{ALL_FILES}}
`;

// Process the template and replace variables
function processTemplate(template, variables) {
    let result = template;
    
    // Replace all variables in the template
    for (const [key, value] of Object.entries(variables)) {
        const placeholder = new RegExp(`{{${key}}}`, 'g');
        result = result.replace(placeholder, value);
    }
    
    return result;
}

// Main function to process files
async function processFiles(files, folderName, templateVariables = {}) {
    try {
        const startTime = performance.now();
        self.postMessage({ type: 'status', message: 'Looking for .gitignore file...' });
        
        // Find and process .gitignore file first if it exists
        const gitignoreFile = files.find(file => 
            file.webkitRelativePath.endsWith('/.gitignore') || 
            file.name === '.gitignore'
        );
        
        let ignorePatterns = [];
        if (gitignoreFile) {
            const gitignoreData = await readFileAsText(gitignoreFile);
            if (!gitignoreData.error) {
                ignorePatterns = parseGitignore(gitignoreData.content);
                self.postMessage({ 
                    type: 'status', 
                    message: `Found .gitignore with ${ignorePatterns.length} patterns` 
                });
            }
        } else {
            self.postMessage({ type: 'status', message: 'No .gitignore file found, still ignoring .git directories' });
        }

        // Process all files (excluding any that match gitignore patterns)
        self.postMessage({ type: 'status', message: 'Processing files...' });
        
        let filesContent = '';
        const filePromises = [];
        
        let totalFiles = 0;
        let ignoredFiles = 0;
        let gitIgnoredFiles = 0;

        // Look for template file
        const templateFile = files.find(file => 
            file.name === 'merged.template.md' || 
            file.webkitRelativePath.endsWith('/merged.template.md')
        );
        
        let templateContent = DEFAULT_TEMPLATE;
        if (templateFile) {
            const templateData = await readFileAsText(templateFile);
            if (!templateData.error) {
                templateContent = templateData.content;
                self.postMessage({ 
                    type: 'status', 
                    message: 'Found template file' 
                });
            }
        }

        for (const file of files) {
            // Skip directories if they appear in the list
            if (file.size === 0 && !file.type && !file.name.includes('.')) {
                continue;
            }
            
            // Skip directory entries more robustly
            if (file.size === 0 && file.type === "") {
                const isLikelyDir = !file.name.includes('.') || file.webkitRelativePath.endsWith('/');
                if (isLikelyDir && files.some(f => 
                    f.webkitRelativePath.startsWith(file.webkitRelativePath) && f !== file)) {
                    continue;
                }
            }
            
            // Skip if file matches gitignore pattern or is in .git directory
            const relativePath = file.webkitRelativePath || file.name;
            if (shouldIgnoreFile(relativePath, ignorePatterns)) {
                // Count .git files separately for reporting
                if (relativePath.includes('/.git/') || relativePath === '.git' || relativePath.startsWith('.git/')) {
                    gitIgnoredFiles++;
                } else {
                    ignoredFiles++;
                }
                continue;
            }
            
            // Skip the template file itself
            if (file === templateFile) {
                continue;
            }

            totalFiles++;
            filePromises.push(
                readFileAsText(file).then(fileData => {
                    return {
                        path: relativePath,
                        content: fileData.content,
                        error: fileData.error
                    };
                })
            );
        }

        const results = await Promise.all(filePromises);
        results.sort((a, b) => a.path.localeCompare(b.path)); // Sort by path for consistent order

        results.forEach(result => {
            filesContent += `## ${result.path}\n`;
            if (result.error) {
                filesContent += `\`\`\`\nError reading file: ${result.error}\n\`\`\`\n\n`;
            } else {
                // Handle code blocks in the content
                let fencedContent = result.content;
                if (fencedContent.includes('```')) {
                    console.warn(`File ${result.path} contains '\`\`\`'. Manual adjustment of Markdown might be needed if nesting code blocks.`);
                }
                filesContent += `\`\`\`\n${fencedContent}\n\`\`\`\n\n`;
            }
        });

        // Prepare variables for template
        const currentDate = new Date().toLocaleString();
        const variables = {
            FOLDER_NAME: folderName,
            DATE: currentDate,
            ALL_FILES: filesContent,
            ...templateVariables
        };
        
        // Process the template with variables
        const mdContent = processTemplate(templateContent, variables);

        const endTime = performance.now();
        const processingTime = ((endTime - startTime) / 1000).toFixed(2);
        
        self.postMessage({ 
            type: 'result', 
            markdown: mdContent, 
            stats: {
                processed: results.length,
                ignored: ignoredFiles,
                gitIgnored: gitIgnoredFiles,
                total: totalFiles + ignoredFiles + gitIgnoredFiles,
                time: processingTime
            }
        });

    } catch (error) {
        self.postMessage({ 
            type: 'error', 
            message: error.message || 'Unknown error during processing' 
        });
    }
}

// Listen for messages from the main thread
self.addEventListener('message', async function(e) {
    const { files, folderName, templateVariables } = e.data;
    
    if (files && files.length > 0) {
        await processFiles(files, folderName, templateVariables || {});
    } else {
        self.postMessage({ 
            type: 'error', 
            message: 'No files received by worker' 
        });
    }
}); 