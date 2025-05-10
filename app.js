document.addEventListener('DOMContentLoaded', () => {
    // DOM elements
    const folderInputElement = document.getElementById('folderInput');
    const processButtonElement = document.getElementById('processButton');
    const downloadButtonElement = document.getElementById('downloadButton');
    const mdPreviewElement = document.getElementById('mdPreview');
    const statusElement = document.getElementById('status');
    const addVariableButtonElement = document.getElementById('addVariableButton');
    const customVariablesElement = document.getElementById('customVariables');
    const systemPromptElement = document.getElementById('systemPrompt');

    // App state
    let selectedFiles = [];
    let generatedMarkdown = '';
    let selectedFolderName = 'merged_output';
    let worker = null;
    let customVariableCount = 0;

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

    // Handle worker messages
    function handleWorkerMessage(e) {
        const { type, message, markdown, stats } = e.data;

        switch (type) {
            case 'status':
                statusElement.textContent = message;
                break;
                
            case 'result':
                generatedMarkdown = markdown;
                mdPreviewElement.value = generatedMarkdown;
                
                // Display stats
                let statusMsg = `Processed ${stats.processed} files`;
                
                // Include details about ignored files
                const totalIgnored = stats.ignored + stats.gitIgnored;
                if (totalIgnored > 0) {
                    let ignoreDetails = [];
                    
                    if (stats.ignored > 0) {
                        ignoreDetails.push(`${stats.ignored} by .gitignore`);
                    }
                    
                    if (stats.gitIgnored > 0) {
                        ignoreDetails.push(`${stats.gitIgnored} in .git folder`);
                    }
                    
                    statusMsg += ` (ignored: ${ignoreDetails.join(', ')})`;
                }
                
                statusMsg += ` in ${stats.time}s. Preview generated.`;
                statusElement.textContent = statusMsg;
                
                downloadButtonElement.disabled = false;
                processButtonElement.disabled = false;
                break;
                
            case 'error':
                console.error("Worker error:", message);
                statusElement.textContent = `Error processing files: ${message}`;
                mdPreviewElement.value = `Error: ${message}`;
                processButtonElement.disabled = false;
                break;
        }
    }

    // Add a new custom variable input to the UI
    function addCustomVariableInput() {
        customVariableCount++;
        const variableRow = document.createElement('div');
        variableRow.className = 'variable-row';
        
        const variableLabel = document.createElement('input');
        variableLabel.type = 'text';
        variableLabel.className = 'variable-name';
        variableLabel.placeholder = 'VARIABLE_NAME';
        variableLabel.id = `varName${customVariableCount}`;
        
        const variableValue = document.createElement('textarea');
        variableValue.className = 'variable-value';
        variableValue.placeholder = 'Variable value...';
        variableValue.id = `varValue${customVariableCount}`;
        
        const deleteButton = document.createElement('button');
        deleteButton.textContent = 'Remove';
        deleteButton.className = 'delete-variable';
        deleteButton.addEventListener('click', () => {
            customVariablesElement.removeChild(variableRow);
        });
        
        variableRow.appendChild(variableLabel);
        variableRow.appendChild(variableValue);
        variableRow.appendChild(deleteButton);
        
        customVariablesElement.appendChild(variableRow);
    }

    // Collect all template variables from the UI
    function collectTemplateVariables() {
        const variables = {
            SYSTEM_PROMPT: systemPromptElement.value
        };
        
        // Collect custom variables
        const customVariableRows = customVariablesElement.querySelectorAll('.variable-row');
        customVariableRows.forEach((row, index) => {
            const nameInput = row.querySelector('.variable-name');
            const valueInput = row.querySelector('.variable-value');
            
            if (nameInput && valueInput && nameInput.value.trim()) {
                variables[nameInput.value.trim()] = valueInput.value;
            }
        });
        
        return variables;
    }

    // Handle folder selection
    folderInputElement.addEventListener('change', (event) => {
        selectedFiles = Array.from(event.target.files);
        
        if (selectedFiles.length > 0) {
            // Try to get the folder name from the first file's relative path
            const firstFilePath = selectedFiles[0].webkitRelativePath;
            if (firstFilePath && firstFilePath.includes('/')) {
                selectedFolderName = firstFilePath.substring(0, firstFilePath.indexOf('/'));
            } else {
                selectedFolderName = 'selected_folder_output';
            }

            statusElement.textContent = `${selectedFiles.length} file(s)/item(s) found in folder. Ready to process.`;
            processButtonElement.disabled = false;
            downloadButtonElement.disabled = true;
            mdPreviewElement.value = '';
            generatedMarkdown = '';
        } else {
            statusElement.textContent = 'No files selected or folder is empty.';
            processButtonElement.disabled = true;
        }
    });

    // Handle add variable button click
    addVariableButtonElement.addEventListener('click', addCustomVariableInput);

    // Handle process button click
    processButtonElement.addEventListener('click', () => {
        if (selectedFiles.length === 0) {
            statusElement.textContent = 'Please select a folder first.';
            return;
        }

        statusElement.textContent = 'Starting processing...';
        processButtonElement.disabled = true;
        downloadButtonElement.disabled = true;
        mdPreviewElement.value = 'Processing...';

        // Collect template variables
        const templateVariables = collectTemplateVariables();

        // Initialize worker and start processing
        const worker = initWorker();
        
        // Clone the file list to send to worker
        // Note: We can't directly send File objects to workers (they're non-cloneable)
        // but the Transfer property of postMessage handles this for us
        worker.postMessage({
            files: selectedFiles,
            folderName: selectedFolderName,
            templateVariables: templateVariables
        });
    });

    // Handle download button click
    downloadButtonElement.addEventListener('click', () => {
        if (!generatedMarkdown) {
            statusElement.textContent = 'No Markdown content to download.';
            return;
        }

        const blob = new Blob([generatedMarkdown], { type: 'text/markdown;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${selectedFolderName.replace(/[^a-z0-9_.-]/gi, '_') || 'merged_files'}.md`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        statusElement.textContent = `Markdown file '${a.download}' download initiated.`;
    });
}); 