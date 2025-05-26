import { storeDirectoryHandle, getDirectoryHandle, removeDirectoryHandle, listStoredHandles } from './dbManager.js';

document.addEventListener('DOMContentLoaded', () => {
    // DOM elements
    const folderInputElement = document.getElementById('folderInput');
    const processButtonElement = document.getElementById('processButton');
    const mdPreviewElement = document.getElementById('mdPreview');
    const statusElement = document.getElementById('status');
    const notificationElement = document.getElementById('notification');
    const notificationMessageElement = document.getElementById('notificationMessage');
    const addVariableButtonElement = document.getElementById('addVariableButton');
    const customVariablesElement = document.getElementById('customVariables');
    const systemPromptElement = document.getElementById('systemPrompt');
    const mergeTemplateElement = document.getElementById('mergeTemplate');

    // New DOM elements for Step 2
    const openFolderButtonElement = document.getElementById('openFolderButton');
    const currentFolderPathElement = document.getElementById('currentFolderPath');
    const fileExplorerSectionElement = document.getElementById('fileExplorerSection');
    const fileExplorerTreeElement = document.getElementById('fileExplorerTree');
    const closeFolderButtonElement = document.getElementById('closeFolderButton');

    // Fallback template content (in case file loading fails)
    const FALLBACK_MERGE_TEMPLATE = `{{SYSTEM_PROMPT}}

Create at {{DATE}}

{{ALL_FILES}}

{{SYSTEM_PROMPT}} `;

    // Fallback system prompt content
    const FALLBACK_SYSTEM_PROMPT = `You are a helpful AI assistant.`;

    // Function to load file content
    async function loadFileContent(filePath) {
        try {
            const response = await fetch(filePath);
            if (!response.ok) {
                throw new Error(`Failed to load ${filePath}: ${response.status} ${response.statusText}`);
            }
            return await response.text();
        } catch (error) {
            console.error(`Error loading ${filePath}:`, error);
            return null;
        }
    }

    // Load default files on startup
    async function loadDefaultFiles() {
        // Show loading status
        statusElement.textContent = 'Loading default files...';
        
        try {
            // Load system prompt file
            const systemPromptContent = await loadFileContent('systemp_prompt.md');
            if (systemPromptContent && systemPromptElement) {
                systemPromptElement.value = systemPromptContent;
                console.log('Loaded system prompt from file');
            } else {
                systemPromptElement.value = FALLBACK_SYSTEM_PROMPT;
                console.warn('Using fallback system prompt');
            }
            
            // Load merge template file
            const mergeTemplateContent = await loadFileContent('merged.template.md');
            if (mergeTemplateContent && mergeTemplateElement) {
                mergeTemplateElement.value = mergeTemplateContent;
                console.log('Loaded merge template from file');
            } else {
                mergeTemplateElement.value = FALLBACK_MERGE_TEMPLATE;
                console.warn('Using fallback merge template');
            }
            
            // Status update moved to tryRestoreLastFolder or initial state
            // statusElement.textContent = 'Default files loaded. Select a folder to begin.';
        } catch (error) {
            console.error('Error loading default files:', error);
            
            // Use fallbacks if loading fails
            if (systemPromptElement) {
                systemPromptElement.value = FALLBACK_SYSTEM_PROMPT;
            }
            
            if (mergeTemplateElement) {
                mergeTemplateElement.value = FALLBACK_MERGE_TEMPLATE;
            }
            
            // Status update moved to tryRestoreLastFolder or initial state
            // statusElement.textContent = 'Failed to load some default files. Select a folder to begin.';
        }
    }

    // Call the function to load default files
    loadDefaultFiles();

    // App state
    let selectedFiles = [];
    let generatedMarkdown = '';
    let worker = null;
    let customVariableCount = 0;
    let outputFilename = '';
    
    // Step 2: selectedFolderHandle and currentFolderId
    let selectedFolderHandle = null;
    let currentFolderId = '';
    
    // Step 3: ignorePatterns and selectedFilesForMerge (moved from Step 4 for early definition)
    let ignorePatterns = []; // To store combined ignore patterns
    let selectedFilesForMerge = new Set(); // Stores paths of selected files relative to folder root (from Step 4)

    // Create a progress bar element
    const progressContainer = document.createElement('div');
    progressContainer.className = 'hidden w-full bg-gray-200 rounded-full h-4 my-4';
    progressContainer.innerHTML = '<div id="progressBar" class="bg-blue-600 h-4 rounded-full text-xs text-center text-white leading-4" style="width: 0%">0%</div>';
    statusElement.parentNode.insertBefore(progressContainer, statusElement.nextSibling);
    
    const progressBarElement = document.getElementById('progressBar');

    // Show a notification
    function showNotification(message, isSuccess = true, withRetryButton = false) {
        notificationMessageElement.textContent = message;
        notificationElement.classList.remove('hidden', 'bg-green-100', 'text-green-700', 'bg-red-100', 'text-red-700', 'bg-yellow-100', 'text-yellow-700');
        
        // Remove any existing retry button
        const existingRetryBtn = document.getElementById('retryFolderAccessBtn');
        if (existingRetryBtn) {
            existingRetryBtn.remove();
        }
        
        if (isSuccess) {
            notificationElement.classList.add('bg-green-100', 'text-green-700', 'border-green-300');
        } else if (withRetryButton) {
            notificationElement.classList.add('bg-yellow-100', 'text-yellow-700', 'border-yellow-300');
            
            const retryBtn = document.createElement('button');
            retryBtn.id = 'retryFolderAccessBtnNew';
            retryBtn.className = 'ml-3 bg-yellow-500 hover:bg-yellow-600 text-white py-1 px-3 rounded text-sm';
            retryBtn.textContent = 'Grant Folder Access';
            retryBtn.onclick = () => requestFolderAccess();
            notificationElement.appendChild(retryBtn);
        } else {
            notificationElement.classList.add('bg-red-100', 'text-red-700', 'border-red-300');
        }
        
        notificationElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    // Hide notification
    function hideNotification() {
        notificationElement.classList.add('hidden');
    }

    // More robust check for File System Access API support
    const hasFileSystemAccessAPI = (
        typeof window !== 'undefined' && 
        'showDirectoryPicker' in window && 
        typeof window.showDirectoryPicker === 'function'
    );

    // Step 2: New requestFolderAccess function
    async function requestFolderAccess(options = { mode: 'readwrite' }) {
        try {
            const handle = await window.showDirectoryPicker(options);
            if (handle) {
                selectedFolderHandle = handle;
                currentFolderId = handle.name;
                await storeDirectoryHandle(currentFolderId, handle);
                localStorage.setItem('lastOpenedFolderId', currentFolderId);
                if (currentFolderPathElement) currentFolderPathElement.textContent = `Selected Folder: ${handle.name}`;
                if (statusElement) statusElement.textContent = `Folder "${handle.name}" opened. Displaying files...`;
                showNotification(`Folder "${handle.name}" access granted.`, true);
                if (fileExplorerSectionElement) fileExplorerSectionElement.classList.remove('hidden');
                await populateFileExplorer(handle);
                updateProcessButtonState();
                if (closeFolderButtonElement) closeFolderButtonElement.classList.remove('hidden');
                if (openFolderButtonElement) openFolderButtonElement.disabled = true;
                return true;
            }
        } catch (err) {
            if (err.name !== 'AbortError') {
                console.error('Error selecting folder:', err);
                statusElement.textContent = 'Could not open folder. ' + err.message;
                showNotification('Error opening folder: ' + err.message, false);
            } else {
                statusElement.textContent = 'Folder selection cancelled.';
            }
            return false;
        }
    }
    
    // Step 2: On Page Load - attempt to restore last opened folder
    async function tryRestoreLastFolder() {
        const lastFolderId = localStorage.getItem('lastOpenedFolderId');
        if (lastFolderId) {
            if(statusElement) statusElement.textContent = `Attempting to reopen folder: ${lastFolderId}...`;
            const handle = await getDirectoryHandle(lastFolderId);
            if (handle) {
                const options = { mode: 'readwrite' };
                let permissionGranted = false;
                if (await handle.queryPermission(options) === 'granted') {
                    permissionGranted = true;
                    if(statusElement) statusElement.textContent = `Restored access to folder "${handle.name}". Displaying files...`;
                    showNotification(`Restored access to folder "${handle.name}".`, true);
                } else if (await handle.requestPermission(options) === 'granted') {
                    permissionGranted = true;
                    if(statusElement) statusElement.textContent = `Re-granted access to folder "${handle.name}". Displaying files...`;
                    showNotification(`Re-granted access to folder "${handle.name}".`, true);
                }

                if (permissionGranted) {
                    selectedFolderHandle = handle;
                    currentFolderId = handle.name;
                    if(currentFolderPathElement) currentFolderPathElement.textContent = `Selected Folder: ${handle.name}`;
                    if(fileExplorerSectionElement) fileExplorerSectionElement.classList.remove('hidden');
                    await populateFileExplorer(handle);
                    updateProcessButtonState(); 
                    if (closeFolderButtonElement) closeFolderButtonElement.classList.remove('hidden');
                    if (openFolderButtonElement) openFolderButtonElement.disabled = true;
                } else {
                    if(statusElement) statusElement.textContent = `Permission denied for folder "${lastFolderId}". Please open it again.`;
                    showNotification(`Permission denied for folder "${lastFolderId}".`, false);
                    await removeDirectoryHandle(lastFolderId); 
                    localStorage.removeItem('lastOpenedFolderId');
                    resetFolderState();
                }
            } else {
                 if(statusElement) statusElement.textContent = 'No previously opened folder found or access lost. Please open a folder.';
                 localStorage.removeItem('lastOpenedFolderId'); 
                 resetFolderState();
            }
        } else {
             if(statusElement) statusElement.textContent = 'Select a folder to begin.';
             resetFolderState();
        }
    }

    // Initialize web worker
    function initWorker() {
        // Terminate existing worker if any
        if (worker) {
            worker.terminate();
        }

        // Create new worker
        worker = new Worker('worker.js');

        // Setup worker message handling
        worker.addEventListener('message', handleWorkerMessage);
        
        return worker;
    }

    // Check browser compatibility at startup
    if (!hasFileSystemAccessAPI) {
        // Show a browser compatibility warning if File System Access API is not available
        statusElement.textContent = 'Note: Your browser does not support direct file saving. For best results, use Chrome, Edge, or other Chromium-based browsers.';
    }

    // Step 5: Helper to get a file handle from a path within a directory handle
    async function getFileHandleFromPath(dirHandle, relativePath) {
        const pathParts = relativePath.split('/');
        let currentHandle = dirHandle;
        for (let i = 0; i < pathParts.length; i++) {
            const part = pathParts[i];
            if (!part) continue;
            if (!currentHandle) { // Added check for currentHandle validity
                console.error(`Cannot process path part "${part}" in "${relativePath}" because current handle is null.`);
                return null;
            }
            try {
                if (i === pathParts.length - 1) { // Last part is the file
                    currentHandle = await currentHandle.getFileHandle(part);
                } else { // Directory part
                    currentHandle = await currentHandle.getDirectoryHandle(part);
                }
            } catch (e) {
                console.error(`Error getting handle for part "${part}" in path "${relativePath}":`, e);
                return null; // Handle not found
            }
        }
        return currentHandle;
    }

    // Handle process button click
    processButtonElement.addEventListener('click', async () => {
        if (!selectedFolderHandle || selectedFilesForMerge.size === 0) {
            statusElement.textContent = 'Please open a folder and select files to merge.';
            showNotification('No files selected for merging.', false);
            return;
        }

        statusElement.textContent = 'Starting processing of selected files...';
        processButtonElement.disabled = true;
        hideNotification();
        
        processButtonElement.innerHTML = `
            <svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Processing...
        `;
        
        mdPreviewElement.value = ''; // Clear previous preview

        const filesToProcessDetails = [];
        for (const filePath of selectedFilesForMerge) {
            const fileHandle = await getFileHandleFromPath(selectedFolderHandle, filePath);
            if (fileHandle && fileHandle.kind === 'file') {
                filesToProcessDetails.push({ handle: fileHandle, path: filePath });
            } else {
                console.warn(`Could not get file handle for selected path: ${filePath}. Skipping.`);
                // Optionally notify user about skipped files
            }
        }

        if (filesToProcessDetails.length === 0 && selectedFilesForMerge.size > 0) {
            statusElement.textContent = 'Error: Could not access any of the selected files.';
            showNotification('Error accessing selected files. Check console for details.', false);
            processButtonElement.disabled = false;
            processButtonElement.textContent = "3. Process Files & Generate MD";
            return;
        }
        if (filesToProcessDetails.length < selectedFilesForMerge.size) {
            showNotification('Warning: Some selected files could not be accessed. Check console.', false); // Yellow perhaps?
        }

        const filesDataForWorker = [];
        let filesRead = 0;
        const totalFilesToRead = filesToProcessDetails.length;

        progressContainer.classList.remove('hidden');
        progressBarElement.style.width = '0%';
        progressBarElement.textContent = `0% (0/${totalFilesToRead} files read)`;

        for (const detail of filesToProcessDetails) {
            try {
                const file = await detail.handle.getFile();

                // Safeguard: Check MIME type if available, in addition to earlier extension checks
                if (file.type && !file.type.startsWith('text/') && file.type !== 'application/json' && !file.type.endsWith('+xml') && file.type !== 'application/javascript' && file.type !== 'application/x-yaml' && file.type !== 'application/yaml') {
                    // A more comprehensive list of text-based MIME types might be needed for edge cases
                    // For now, primarily allow text/*, json, xml, js, yaml.
                    if (isBinaryFileByExtension(file.name)) { // Double check with extension if MIME is not clearly text
                        console.warn(`Skipping binary file (MIME type ${file.type || 'unknown'} and extension): ${detail.path}`);
                        // Do not increment filesRead if we skip it before attempting to read content for the worker
                        // Update totalFilesToRead at the beginning or adjust progress logic carefully if skipping here.
                        // For simplicity, we are currently filtering them out from selection. This is an additional safeguard.
                        // If it got here, it means it wasn_t filtered by shouldIgnoreEntry, which is unlikely with the current setup.
                        continue; // Skip this file
                    }
                    // If MIME is binary but extension check passed, it *could* be a text file with an unusual MIME. 
                    // The current logic will attempt to read it. The user can specifically ignore it via .llmignore if problematic.
                }

                const content = await file.text();
                filesDataForWorker.push({
                    name: detail.handle.name, 
                    relativePath: detail.path,
                    content: content
                });
                filesRead++;
                const percent = totalFilesToRead > 0 ? Math.round((filesRead / totalFilesToRead) * 100) : 0;
                progressBarElement.style.width = `${percent}%`;
                progressBarElement.textContent = `${percent}% (${filesRead}/${totalFilesToRead} files read)`;

            } catch (readError) {
                console.error(`Error reading file ${detail.path}:`, readError);
                filesDataForWorker.push({
                    name: detail.handle.name,
                    relativePath: detail.path,
                    content: `Error reading file: ${readError.message}`,
                    error: true
                });
                 // Update progress for files attempted, even if errored
                filesRead++; 
                const percent = totalFilesToRead > 0 ? Math.round((filesRead / totalFilesToRead) * 100) : 0;
                progressBarElement.style.width = `${percent}%`;
                progressBarElement.textContent = `${percent}% (${filesRead}/${totalFilesToRead} files read) - 1 error`; 
            }
        }
        
        const currentTemplateContent = mergeTemplateElement.value;
        const templateVariables = collectTemplateVariables();
        const worker = initWorker();

        worker.postMessage({
            filesData: filesDataForWorker, 
            templateVariables: templateVariables,
            mergeTemplate: currentTemplateContent,
            hasFolderAccess: !!selectedFolderHandle 
        });
    });

    // Handle add variable button click
    addVariableButtonElement.addEventListener('click', addCustomVariableInput);

    // Collect all template variables from the UI
    function collectTemplateVariables() {
        const variables = {
            SYSTEM_PROMPT: systemPromptElement.value
        };
        
        // Collect custom variables
        const customVariableRows = customVariablesElement.querySelectorAll('.variable-row, div[class^="flex items-start"]');
        customVariableRows.forEach((row) => {
            const nameInput = row.querySelector('input[type="text"]');
            const valueInput = row.querySelector('textarea');
            
            if (nameInput && valueInput && nameInput.value.trim()) {
                variables[nameInput.value.trim()] = valueInput.value;
            }
        });
        
        return variables;
    }

    // Add a new custom variable input to the UI
    function addCustomVariableInput() {
        customVariableCount++;
        const variableRow = document.createElement('div');
        variableRow.className = 'flex items-start mb-4 space-x-2';
        
        const variableLabel = document.createElement('input');
        variableLabel.type = 'text';
        variableLabel.className = 'p-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 w-1/3';
        variableLabel.placeholder = 'VARIABLE_NAME';
        variableLabel.id = `varName${customVariableCount}`;
        
        const variableValue = document.createElement('textarea');
        variableValue.className = 'p-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 flex-grow h-20 resize-y';
        variableValue.placeholder = 'Variable value...';
        variableValue.id = `varValue${customVariableCount}`;
        
        const deleteButton = document.createElement('button');
        deleteButton.textContent = 'Remove';
        deleteButton.className = 'bg-red-500 hover:bg-red-700 text-white font-bold py-2 px-3 rounded text-sm';
        deleteButton.addEventListener('click', () => {
            customVariablesElement.removeChild(variableRow);
        });
        
        variableRow.appendChild(variableLabel);
        variableRow.appendChild(variableValue);
        variableRow.appendChild(deleteButton);
        
        customVariablesElement.appendChild(variableRow);
    }

    // Step 2: Updated DOMContentLoaded
    if (openFolderButtonElement) {
        openFolderButtonElement.addEventListener('click', () => requestFolderAccess());
    }

    if (hasFileSystemAccessAPI) {
        tryRestoreLastFolder();
    } else {
        statusElement.textContent = 'Your browser does not support the File System Access API. Please use a modern browser.';
        showNotification('Browser compatibility issue: Direct folder access not supported.', false);
        if(openFolderButtonElement) openFolderButtonElement.disabled = true;
    }

    // Step 3: Helper to get file/directory handle (adapted from plan)
    async function getEntryHandle(dirHandle, path) {
        const parts = path.split('/').filter(p => p);
        let currentHandle = dirHandle;
        for (const part of parts) {
            if (!currentHandle || typeof currentHandle.getDirectoryHandle !== 'function') { // Check if currentHandle is valid and has methods
                // console.warn(`Cannot get entry '${part}' from non-directory or invalid handle.`);
                return null; 
            }
            if (currentHandle.kind === 'directory') {
                try {
                    currentHandle = await currentHandle.getDirectoryHandle(part);
                } catch (e) { 
                    try {
                        currentHandle = await currentHandle.getFileHandle(part);
                        break; 
                    } catch (e2) {
                        // console.warn(`Entry '${part}' not found in directory.`);
                        return null; 
                    }
                }
            } else {
                // console.warn(`Path tried to go into a file '${currentHandle.name}' at part '${part}'.`);
                return null; 
            }
        }
        return currentHandle;
    }
    
    // Step 3: Function to read file content from a FileSystemFileHandle
    async function readFileContentFromHandle(fileHandle) {
        try {
            const file = await fileHandle.getFile();
            return file.text();
        } catch (e) {
            console.error(`Error reading file ${fileHandle.name}:`, e);
            return `Error reading file: ${e.message}`;
        }
    }

    // Helper function to identify binary files by extension
    function isBinaryFileByExtension(fileName) {
        if (typeof fileName !== 'string') return false;
        const lowerFileName = fileName.toLowerCase();
        const binaryExtensions = [
            // Common image formats
            '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.ico', '.tif', '.tiff',
            // Common audio formats
            '.mp3', '.wav', '.aac', '.ogg', '.oga', '.flac',
            // Common video formats
            '.mp4', '.mov', '.avi', '.wmv', '.mkv', '.flv', '.webm',
            // Document formats that are typically binary
            '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
            // Archives
            '.zip', '.rar', '.tar', '.gz', '.7z',
            // Executables and compiled code
            '.exe', '.dll', '.so', '.o', '.a', '.jar', '.class',
            // Other
            '.psd', '.ai', '.eps', '.sqlite', '.db', '.dat', '.bin',
            '.DS_Store' // Explicitly include .DS_Store here as a common unwanted binary file
        ];
        return binaryExtensions.some(ext => lowerFileName.endsWith(ext));
    }

    // Function to convert a gitignore pattern to a regular expression string.
    function gitignorePatternToRegexString(pattern) {
        let regex = pattern;

        // Handle leading "!" for negation (caller should strip it first if using this for matching)
        // This function just converts the pattern part.
        if (regex.startsWith('!')) {
            regex = regex.substring(1);
        }

        // Handle trailing spaces, which are significant if not escaped
        // Git usually ignores unescaped trailing spaces, so we might trim, 
        // or assume parseIgnoreFile handles it. For now, let's assume they are trimmed.
        // regex = regex.replace(/\\\s+$/, ''); // If we want to keep escaped trailing spaces

        // If pattern starts with #, it's a comment (should be filtered by parseIgnoreFile)
        if (regex.startsWith('#')) return ''; // Should not happen if parseIgnoreFile is correct

        // Handle patterns ending with / (match directories)
        let matchDirOnly = false;
        if (regex.endsWith('/')) {
            matchDirOnly = true;
            regex = regex.substring(0, regex.length - 1); // Remove trailing slash for now
        }

        // Escape special regex characters, but NOT character class operators like [ ]
        regex = regex.replace(/[\.\+\(\)\{\}\^\$\|]/g, '\\$&'); // Escape special chars except [ ] for character classes
        
        // Store the original pattern before escaping
        const originalPattern = pattern;
        
        // Convert ? to [^/]
        regex = regex.replace(/\?/g, '[^/]');
        // Convert **/
        regex = regex.replace(/\*\*\//g, '(?:.*/)?'); // Equivalent to (zero or more dirs)/
        // Convert /**
        regex = regex.replace(/\/\*\*/g, '(?:/.*)?'); // Equivalent to /(zero or more things)
        // Convert *
        regex = regex.replace(/\*/g, '[^/]*');

        // Handle anchoring and directory matching
        if (regex.startsWith('/')) { // Anchored to root
            regex = '^' + regex.substring(1);
        } else if (!originalPattern.includes('/')) { // No slashes in original pattern, match at any level
            // Example: "*.log" or "build" - should match at any level in directory structure
            regex = '(?:^|.*/|/)' + regex; // Match at root, or after any directory separator
        } else { // Contains slashes, but not at the start: relative to current dir (root for us)
            regex = '^' + regex;
        }

        // Finalize based on directory or file match
        if (matchDirOnly) {
            // Pattern was like "foo/" or "/foo/"
            // Should match "foo" or "foo/bar.txt"
            // Regex should match the directory path, then optionally a slash and anything after
            regex += '(?:$|/)'; // Matches the directory itself or paths within it.
        } else {
            // For file patterns, or patterns not ending with /
            // Pattern like "foo" or "*.js"
            // Should match "foo" or "some/path/foo", or "bar.js" or "some/path/bar.js"
            // Current regex for "foo" is (?:^|/)foo
            // For "*.js" is (?:^|/)[^/]*\.js
            // These need to end match the segment or file name
            regex += '(?:$|/)'; // Ensure it matches a full segment or end of path if it's a file match
        }
        // A pattern like "foo" without a trailing slash can match a file or a directory.
        // The regex `(?:^|/)foo(?:$|/)` handles this.
        // A pattern like `*.log` becomes `(?:^|/)[^/]*\.log(?:$|/)`, correctly matching `a.log` or `b/a.log`.

        return regex;
    }

    function parseIgnoreFile(content) { 
         if (!content) return [];
         // Trim lines, filter empty lines and comments.
         return content.split('\n').map(line => line.trim()).filter(line => line && !line.startsWith('#'));
    }

    function shouldIgnoreEntry(relativePath, patterns) { 
        // Built-in ignores (take precedence, cannot be un-ignored by .gitignore)
        if (relativePath.includes('/.git/') || relativePath.startsWith('.git/')) return true;
        if (/[/\\]llm-generated-\\\\d{4}-\\d{2}-\\d{2}T\\\\d{2}-\\d{2}-\\d{2}\\.md$/.test(relativePath)) return true;
        if (isBinaryFileByExtension(relativePath)) {
            return true;
        }

        let isIgnoredByGitignore = false; // Default state for gitignore rules: not ignored by any rule yet.
                                      // This will be true if the last matching rule is an ignore rule,
                                      // or false if the last matching rule is a negation rule.

        for (const p of patterns) {
            if (!p) continue; 

            const isNegated = p.startsWith('!');
            const patternString = isNegated ? p.substring(1) : p;
            
            if (!patternString) continue; // Handles cases like "!" or "! " resulting in empty pattern

            try {
                const regexString = gitignorePatternToRegexString(patternString);
                if (!regexString) continue; // Skip if pattern was just a comment
                const regex = new RegExp(regexString, 'i'); // Case-insensitive to match gitignore behavior

                if (regex.test(relativePath)) {
                    isIgnoredByGitignore = !isNegated; // Last matching rule wins
                }
            } catch (e) {
                console.warn(`Error compiling/testing gitignore pattern '${patternString}':`, e, "Original pattern:", p);
            }
        }
        return isIgnoredByGitignore;
    }

    async function loadIgnoreFiles(directoryHandle) {
        ignorePatterns = [];
        let gitignoreContent = '', llmignoreContent = '';

        try {
            const gitignoreFileHandle = await directoryHandle.getFileHandle('.gitignore');
            gitignoreContent = await readFileContentFromHandle(gitignoreFileHandle);
        } catch (e) { /* console.log('.gitignore not found'); */ }

        try {
            const llmignoreFileHandle = await directoryHandle.getFileHandle('.llmignore');
            llmignoreContent = await readFileContentFromHandle(llmignoreFileHandle);
        } catch (e) { /* console.log('.llmignore not found'); */ }

        if (gitignoreContent && !gitignoreContent.startsWith('Error reading file:')) {
            ignorePatterns.push(...parseIgnoreFile(gitignoreContent));
        }
        if (llmignoreContent && !llmignoreContent.startsWith('Error reading file:')) {
            ignorePatterns.push(...parseIgnoreFile(llmignoreContent));
        }
        // console.log("Loaded ignore patterns:", ignorePatterns);
    }

    // Step 3: populateFileExplorer function
    async function populateFileExplorer(directoryHandle, basePath = '', parentElement = fileExplorerTreeElement) {
        if (basePath === '') { // Root call
            if (fileExplorerTreeElement) {
                while (fileExplorerTreeElement.firstChild) {
                    fileExplorerTreeElement.removeChild(fileExplorerTreeElement.firstChild);
                }
            }
            await loadIgnoreFiles(directoryHandle);

            const hadPreviouslyStoredSelections = localStorage.getItem(`selectedFiles_${currentFolderId}`) !== null;
            loadSelectionsFromLocalStorage(currentFolderId); // Clears selectedFilesForMerge then loads if exists

            const applyDefaults = !hadPreviouslyStoredSelections;
            
            if (applyDefaults) {
                // selectedFilesForMerge is already clear if nothing was loaded.
                // Now, populate it with all non-ignored files recursively.
                await recursivelyAddAllNonIgnoredFilesToSelection(directoryHandle, '');
            }
            // If not applying defaults, selectedFilesForMerge is already populated by loadSelectionsFromLocalStorage.
            // If a file that was selected is now ignored, the rendering logic below will handle it.
        }

        const entries = [];
        try {
            for await (const entry of directoryHandle.values()) {
                entries.push(entry);
            }
        } catch (e) {
            console.error(`Error iterating directory ${directoryHandle.name} at path ${basePath}:`, e);
            const errorDiv = document.createElement('div');
            errorDiv.className = 'text-red-500 p-2';
            errorDiv.textContent = `Error reading directory: ${e.message}`;
            parentElement.appendChild(errorDiv);
            return;
        }
        
        entries.sort((a, b) => {
            if (a.kind !== b.kind) {
                return a.kind === 'directory' ? -1 : 1;
            }
            return a.name.localeCompare(b.name);
        });

        for (const entry of entries) {
            const entryPath = basePath ? `${basePath}/${entry.name}` : entry.name;
            const entryElement = document.createElement('div');
            entryElement.classList.add('file-explorer-item', 'py-1');
            // Indentation based on depth, not just fixed pl-4
            const depth = basePath.split('/').filter(p => p).length;
            entryElement.style.paddingLeft = `${depth * 20 + 10}px`; // 20px per level + 10px base

            const isIgnored = shouldIgnoreEntry(entryPath, ignorePatterns);

            if (entry.kind === 'file') {
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.id = `file-${entryPath.replace(/[^a-zA-Z0-9]/g, '_')}`;
                checkbox.dataset.filePath = entryPath;
                checkbox.className = 'mr-2 transform scale-90'; // Slightly smaller checkbox
                
                const label = document.createElement('label');
                label.setAttribute('for', checkbox.id);
                label.textContent = entry.name;
                label.className = 'cursor-pointer select-none';

                if (isIgnored) {
                    checkbox.disabled = true;
                    checkbox.checked = false; 
                    if (selectedFilesForMerge.has(entryPath)) {
                       selectedFilesForMerge.delete(entryPath); // Remove if it became ignored
                    }
                    entryElement.classList.add('text-gray-400', 'italic'); // Keep visual indication
                    label.title = "Ignored by .gitignore or .llmignore";
                } else { // Not ignored
                    // selectedFilesForMerge is now the single source of truth for checked state.
                    checkbox.checked = selectedFilesForMerge.has(entryPath);
                    checkbox.addEventListener('change', handleFileSelectionChange);
                }
                
                entryElement.appendChild(checkbox);
                entryElement.appendChild(label);
            } else if (entry.kind === 'directory') {
                const dirElementContainer = document.createElement('div'); // Container for checkbox and label
                dirElementContainer.classList.add('flex', 'items-center');

                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.id = `folder-${entryPath.replace(/[^a-zA-Z0-9]/g, '_')}`;
                checkbox.dataset.folderPath = entryPath;
                checkbox.className = 'mr-2 transform scale-90';
                // We'll set its checked/indeterminate state later

                const icon = document.createElement('span');
                icon.textContent = '📁 ';
                icon.className = 'mr-1';

                const nameSpan = document.createElement('span');
                nameSpan.textContent = entry.name;

                dirElementContainer.appendChild(checkbox);
                dirElementContainer.appendChild(icon);
                dirElementContainer.appendChild(nameSpan);

                entryElement.appendChild(dirElementContainer);
                entryElement.classList.add('font-medium', 'hover:bg-gray-100', 'rounded');
                // entryElement is the main clickable div for expanding/collapsing
                // dirElementContainer contains checkbox and text, allowing click on name to expand

                if (isIgnored) {
                     checkbox.disabled = true;
                     entryElement.classList.add('text-gray-400', 'italic');
                     entryElement.title = "Ignored by .gitignore or .llmignore";
                     // Don't add click listener for expanding if ignored
                } else {
                    checkbox.addEventListener('change', (event) => handleFolderCheckboxChange(event, directoryHandle, entry.name, entryPath));
                    
                    // Make the text part (icon + name) clickable for expand/collapse
                    const clickableArea = document.createElement('div');
                    clickableArea.classList.add('flex-grow', 'cursor-pointer', 'p-1'); // Add padding for easier click
                    clickableArea.appendChild(icon); // Icon moves into here
                    clickableArea.appendChild(nameSpan); // Name moves into here
                    
                    // Clear dirElementContainer and rebuild with checkbox and clickableArea
                    while(dirElementContainer.firstChild) dirElementContainer.removeChild(dirElementContainer.firstChild);
                    dirElementContainer.appendChild(checkbox);
                    dirElementContainer.appendChild(clickableArea);

                    clickableArea.addEventListener('click', async (e) => {
                        e.stopPropagation(); 
                        const subDirElement = entryElement.nextElementSibling;
                        if (subDirElement && subDirElement.classList.contains('subdir-container') && subDirElement.dataset.parentPath === entryPath) {
                            subDirElement.remove(); 
                            icon.textContent = '📁 '; 
                        } else {
                            icon.textContent = '📂 '; 
                            const newSubDirContainer = document.createElement('div');
                            newSubDirContainer.className = 'subdir-container';
                            newSubDirContainer.dataset.parentPath = entryPath; 
                            entryElement.insertAdjacentElement('afterend', newSubDirContainer);
                            try {
                                const subDirHandle = await directoryHandle.getDirectoryHandle(entry.name);
                                await populateFileExplorer(subDirHandle, entryPath, newSubDirContainer); // Removed default mode flag
                                updateFolderCheckboxState(checkbox, subDirHandle, entryPath);
                            } catch (err) {
                                console.error(`Error getting directory handle for ${entry.name}:`, err);
                                newSubDirContainer.textContent = `Error: Could not read directory ${entry.name}`;
                                newSubDirContainer.classList.add('text-red-500', 'pl-4');
                            }
                        }
                    });
                    updateFolderCheckboxState(checkbox, directoryHandle, entryPath); // Initial state for the folder checkbox itself
                }
            }
            parentElement.appendChild(entryElement);
        }

        if (basePath === '') { // Root call
            // Always save the final state of selectedFilesForMerge after population.
            // This covers: new defaults, loaded selections, and deselections due to new ignore rules.
            saveSelectionsToLocalStorage(currentFolderId, selectedFilesForMerge);
            updateProcessButtonState(); 
        }
        // For recursive calls, updateProcessButtonState is not strictly needed here as selections are flat
        // and the root call will handle the final update.
    }
    
    // Step 4: Functions for managing file selection state (defined here for populateFileExplorer)
    function handleFileSelectionChange(event) {
        const filePath = event.target.dataset.filePath;
        if (event.target.checked) {
            selectedFilesForMerge.add(filePath);
        } else {
            selectedFilesForMerge.delete(filePath);
        }
        saveSelectionsToLocalStorage(currentFolderId, selectedFilesForMerge);
        updateProcessButtonState();
    }

    function saveSelectionsToLocalStorage(folderId, selections) {
        if (!folderId) return;
        localStorage.setItem(`selectedFiles_${folderId}`, JSON.stringify(Array.from(selections)));
    }

    function loadSelectionsFromLocalStorage(folderId) {
        selectedFilesForMerge.clear(); // Ensure it's empty before trying to load for this folder.
        if (!folderId) {
            return; // currentFolderId is not set, selectedFilesForMerge remains empty.
        }
        
        const savedSelectionJSON = localStorage.getItem(`selectedFiles_${folderId}`);
        if (savedSelectionJSON) {
            try {
                const parsedArr = JSON.parse(savedSelectionJSON);
                if (Array.isArray(parsedArr)) {
                    selectedFilesForMerge = new Set(parsedArr); // Assign the new Set
                } else {
                    console.error(`Stored selection for ${folderId} is not an array:`, parsedArr);
                    // selectedFilesForMerge remains empty due to the initial clear().
                }
            } catch (e) {
                console.error(`Error parsing stored selections for ${folderId}:`, e);
                // selectedFilesForMerge remains empty due to the initial clear().
            }
        }
        // If savedSelectionJSON is null, selectedFilesForMerge remains empty from the initial clear().
    }

    function updateProcessButtonState() {
        if (processButtonElement) {
            processButtonElement.disabled = selectedFilesForMerge.size === 0 || !selectedFolderHandle;
        }
    }

    // Handle worker messages
    function handleWorkerMessage(e) {
        const { type, message, markdown, stats, selectedFolderName, outputFilename: workerOutputFilename, processed, total, percent, fileSaved } = e.data;

        switch (type) {
            case 'status':
                statusElement.textContent = message;
                break;
                
            case 'progress':
                progressContainer.classList.remove('hidden');
                progressBarElement.style.width = `${percent}%`;
                progressBarElement.textContent = `${percent}% (${processed}/${total} files)`;
                break;
                
            case 'fileSaved': // This case might become obsolete if worker no longer saves directly
                progressContainer.classList.add('hidden');
                if (processButtonElement) {
                    processButtonElement.disabled = false;
                    processButtonElement.textContent = "3. Process Files & Generate MD";
                }
                showNotification(`File successfully saved by worker as ${fileSaved}`, true);
                break;
                
            case 'result':
                progressContainer.classList.add('hidden');
                generatedMarkdown = markdown;
                
                if (workerOutputFilename) {
                    outputFilename = workerOutputFilename; // Use filename from worker
                }
                
                if (selectedFolderHandle && outputFilename && markdown) {
                    saveFileToDirectory(outputFilename, markdown)
                        .then(() => {
                            statusElement.textContent = `Processing complete.`;
                            showNotification(`File successfully saved as ${outputFilename} in "${selectedFolderHandle.name}"`, true);
                        })
                        .catch(async (error) => { 
                            console.error("Save file error:", error);
                            statusElement.textContent = `Error saving file: ${error.message}`;
                            showNotification(`Error saving file: ${error.message}. Trying to re-verify permission.`, false);
                            
                            if (selectedFolderHandle && typeof selectedFolderHandle.requestPermission === 'function') {
                                try {
                                    if (await selectedFolderHandle.requestPermission({ mode: 'readwrite' }) === 'granted') {
                                        showNotification('Permission re-granted. Retrying save...', true);
                                        try {
                                            await saveFileToDirectory(outputFilename, markdown);
                                            statusElement.textContent = `Processing complete.`; // Reset status after successful save
                                            showNotification(`File successfully saved as ${outputFilename} after retry.`, true);
                                        } catch (retryError) {
                                            console.error("Save file retry error:", retryError);
                                            statusElement.textContent = `Error saving file after retry: ${retryError.message}`;
                                            showNotification(`Error saving file after retry: ${retryError.message}. Please try downloading.`, false, true); // 'true' for retry button -> download
                                            offerDownload(outputFilename, markdown); // Implement offerDownload
                                        }
                                    } else {
                                        showNotification(`Could not save file directly due to permission issues. Please try downloading.`, false, true);
                                        offerDownload(outputFilename, markdown); // Implement offerDownload
                                    }
                                } catch (permError) {
                                     console.error("Permission request error during save:", permError);
                                     showNotification(`Permission request failed. Please try downloading.`, false, true);
                                     offerDownload(outputFilename, markdown); // Implement offerDownload
                                }
                            } else {
                                 showNotification(`Could not save file directly. Folder access lost or invalid. Please try downloading.`, false, true);
                                 offerDownload(outputFilename, markdown); // Implement offerDownload
                            }
                        });
                } else {
                    statusElement.textContent = 'Processing complete. Folder access lost or output missing. Please download the file manually.';
                    showNotification('Process complete, but could not save to folder. Download the file manually.', false, true);
                    if (outputFilename && markdown) {
                       offerDownload(outputFilename, markdown); // Implement offerDownload
                    }
                }
                
                if (processButtonElement) {
                    processButtonElement.disabled = false;
                    processButtonElement.textContent = "3. Process Files & Generate MD";
                }
                break;
                
            case 'error':
                console.error('Worker error:', message);
                statusElement.textContent = `Error: ${message}`;
                showNotification(`Error: ${message}`, false);
                break;
        }
    }

    // Helper function to offer download (implement as per Step 6 suggestion)
    function offerDownload(filename, content) {
        const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const downloadLink = document.createElement('a');
        downloadLink.href = url;
        downloadLink.download = filename;
        
        // Append to body, click, and remove (standard way to trigger download)
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
        URL.revokeObjectURL(url);
        
        // Update notification to reflect that download was offered
        // The showNotification in the catch blocks already mentions download, 
        // but we can add a specific one if `withRetryButton` (true) is used for the download prompt.
        // The `showNotification` for download scenarios might need a specific message.
        // For now, the calling contexts handle the message.
        console.log(`Offered download for ${filename}`);
    }

    // Function to save a file to the selected directory using the File System Access API
    async function saveFileToDirectory(fileName, content) {
        if (!selectedFolderHandle) {
            console.error('No folder access. Cannot save file.');
            // showNotification('Folder access lost. Cannot save file.', false);
            throw new Error('No folder access. Please select a folder first.');
        }
        
        try {
            const fileHandle = await selectedFolderHandle.getFileHandle(fileName, { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(content);
            await writable.close();
            return true;
        } catch (error) {
            console.error(`Error saving file ${fileName} to directory:`, error);
            // showNotification(`Error saving file: ${error.message}`, false);
            throw error; // Re-throw to be caught by the caller in handleWorkerMessage
        }
    }

    // Step 7: Function to reset folder state
    function resetFolderState() {
        if (currentFolderId) {
            // Option to remove stored handle: If removed, user must re-select from picker always.
            // removeDirectoryHandle(currentFolderId).catch(err => console.warn("Could not remove stored handle on close:", err));
            
            // Clear selections for this specific folder ID
            localStorage.removeItem(`selectedFiles_${currentFolderId}`);
            
            // Clear the overall last opened folder ID, so it doesn't try to reopen this one.
            localStorage.removeItem('lastOpenedFolderId'); 
        }
        selectedFolderHandle = null;
        currentFolderId = '';
        selectedFilesForMerge.clear();
        if (fileExplorerTreeElement) fileExplorerTreeElement.innerHTML = '<p class="text-gray-500 p-3">No folder opened.</p>';
        if (fileExplorerSectionElement) fileExplorerSectionElement.classList.add('hidden');
        if (currentFolderPathElement) currentFolderPathElement.textContent = '';
        if (statusElement) statusElement.textContent = 'Select a folder to begin.';
        if (processButtonElement) processButtonElement.disabled = true;
        if (closeFolderButtonElement) closeFolderButtonElement.classList.add('hidden');
        if (openFolderButtonElement) openFolderButtonElement.disabled = false;
        updateProcessButtonState(); // Ensure button state is consistent
    }

    // Step 7: Add event listener for closeFolderButton
    if (closeFolderButtonElement) {
        closeFolderButtonElement.addEventListener('click', resetFolderState);
    }

    if (hasFileSystemAccessAPI) {
        tryRestoreLastFolder();
    } else {
        statusElement.textContent = 'Your browser does not support the File System Access API. Please use a modern browser.';
        showNotification('Browser compatibility issue: Direct folder access not supported.', false);
        if(openFolderButtonElement) openFolderButtonElement.disabled = true;
    }
    updateProcessButtonState(); // Initial call to set button state
    // Any other initial setup from original DOMContentLoaded

    // New function to handle folder checkbox changes
    async function handleFolderCheckboxChange(event, parentDirHandle, folderName, folderPath) {
        const isChecked = event.target.checked;
        const folderHandle = await parentDirHandle.getDirectoryHandle(folderName); // Get the specific directory handle

        if (!folderHandle) {
            console.error("Could not get handle for folder:", folderPath);
            return;
        }
        console.log(`Folder ${folderPath} checkbox changed to: ${isChecked}`);

        await recursivelyUpdateFilesInFolder(folderHandle, folderPath, isChecked, event.target);

        // After recursive update, save and update global UI state
        saveSelectionsToLocalStorage(currentFolderId, selectedFilesForMerge);
        updateProcessButtonState();
        // Parent folder checkboxes might need updating if this is a nested folder (more advanced)
    }

    // New recursive function to update file selections within a folder
    async function recursivelyUpdateFilesInFolder(dirHandle, basePath, select, triggeringCheckbox) {
        for await (const entry of dirHandle.values()) {
            const entryPath = `${basePath}/${entry.name}`;
            const isIgnored = shouldIgnoreEntry(entryPath, ignorePatterns);

            if (entry.kind === 'file') {
                if (!isIgnored) {
                    const fileCheckbox = document.getElementById(`file-${entryPath.replace(/[^a-zA-Z0-9]/g, '_')}`);
                    if (select) {
                        selectedFilesForMerge.add(entryPath);
                        if (fileCheckbox) fileCheckbox.checked = true;
                    } else {
                        selectedFilesForMerge.delete(entryPath);
                        if (fileCheckbox) fileCheckbox.checked = false;
                    }
                }
            } else if (entry.kind === 'directory') {
                if (!isIgnored) {
                    const subDirHandle = await dirHandle.getDirectoryHandle(entry.name);
                    // Update nested folder's checkbox visually based on parent action for now
                    const folderCheckboxUI = document.getElementById(`folder-${entryPath.replace(/[^a-zA-Z0-9]/g, '_')}`);
                    if (folderCheckboxUI) {
                        folderCheckboxUI.checked = select;
                        folderCheckboxUI.indeterminate = false; // Clear indeterminate if parent forces state
                    }
                    await recursivelyUpdateFilesInFolder(subDirHandle, entryPath, select, folderCheckboxUI);
                }
            }
        }
        // After processing all entries in *this* folder, update the folder checkbox that triggered this call.
        // This ensures its visual state (checked/unchecked/indeterminate) is accurate.
        if (triggeringCheckbox) { // Check if it was passed (it won't be for initial population)
             updateFolderCheckboxState(triggeringCheckbox, dirHandle, basePath);
        }
    }
    
    // New function to update a folder checkbox's visual state (checked, unchecked, indeterminate)
    async function updateFolderCheckboxState(folderCheckboxElement, dirHandle, dirPath) {
        if (!folderCheckboxElement) return;

        let allSelected = true;
        let noneSelected = true;
        let hasFiles = false; // Track if there are any non-ignored files at all

        // This helper will check selection status of files within the given directory and its children
        async function checkSelectionStatus(currentDirHandle, currentBasePath) {
            for await (const entry of currentDirHandle.values()) {
                const entryPath = `${currentBasePath}/${entry.name}`;
                const isIgnored = shouldIgnoreEntry(entryPath, ignorePatterns);

                if (isIgnored) continue;

                if (entry.kind === 'file') {
                    hasFiles = true;
                    if (selectedFilesForMerge.has(entryPath)) {
                        noneSelected = false;
                    } else {
                        allSelected = false;
                    }
                } else if (entry.kind === 'directory') {
                    const subDirHandle = await currentDirHandle.getDirectoryHandle(entry.name);
                    // If recursive check already made one of these false, no need to re-evaluate that one
                    await checkSelectionStatus(subDirHandle, entryPath);
                    if (!allSelected && !noneSelected) break; // Short-circuit if already indeterminate
                }
            }
        }

        await checkSelectionStatus(dirHandle, dirPath);

        if (!hasFiles) { // No non-ignored files in this folder or subfolders
            folderCheckboxElement.checked = false;
            folderCheckboxElement.indeterminate = false;
            folderCheckboxElement.disabled = true; // Optionally disable if no selectable files
        } else if (allSelected) {
            folderCheckboxElement.checked = true;
            folderCheckboxElement.indeterminate = false;
        } else if (noneSelected) {
            folderCheckboxElement.checked = false;
            folderCheckboxElement.indeterminate = false;
        } else { // Mixed selection
            folderCheckboxElement.checked = false;
            folderCheckboxElement.indeterminate = true;
        }
    }

    // New function (Step for fixing default subfolder selection)
    async function recursivelyAddAllNonIgnoredFilesToSelection(dirHandle, basePath) {
        try {
            for await (const entry of dirHandle.values()) {
                const entryPath = basePath ? `${basePath}/${entry.name}` : entry.name;
                const isIgnored = shouldIgnoreEntry(entryPath, ignorePatterns);

                if (isIgnored) {
                    continue;
                }

                if (entry.kind === 'file') {
                    selectedFilesForMerge.add(entryPath);
                } else if (entry.kind === 'directory') {
                    try {
                        const subDirHandle = await dirHandle.getDirectoryHandle(entry.name);
                        await recursivelyAddAllNonIgnoredFilesToSelection(subDirHandle, entryPath);
                    } catch (e) {
                        console.warn(`Could not traverse subdirectory ${entryPath} for default selection:`, e);
                    }
                }
            }
        } catch (e) {
            console.error(`Error in recursivelyAddAllNonIgnoredFilesToSelection for ${basePath || 'root'}:`, e);
        }
    }
}); 