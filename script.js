// This is the core JavaScript file for the ICD-11 search tool.
// It configures and initializes the WHO Embedded Coding Tool (ECT) library.

// Get references to our HTML elements
const searchButton = document.getElementById('search-button');
const searchInput = document.getElementById('icd-input');
const spinner = document.getElementById('loading-spinner');

// Flag to track if ECT library is available
let isECTAvailable = false;

// Handle ECT library load error
function handleECTLoadError() {
    console.warn("ECT library failed to load from CDN. Falling back to direct API implementation.");
    isECTAvailable = false;
    initializeDirectAPI();
}

// Fallback direct API implementation
function initializeDirectAPI() {
    console.log("Initializing direct API implementation...");
    searchButton.disabled = false;
    searchInput.disabled = false;
    searchButton.textContent = 'Search';
    
    // Create a simple results container
    const resultsContainer = document.querySelector('.ctw-window');
    if (resultsContainer) {
        resultsContainer.innerHTML = '<p style="text-align: center; color: #666; padding: 20px;">Enter a search term above to find ICD-11 codes</p>';
    }
}

// Direct API search function
async function searchDirectAPI(query) {
    try {
        spinner.classList.remove('hidden');
        searchButton.disabled = true;
        searchButton.textContent = 'Searching...';
        
        const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        if (!response.ok) {
            throw new Error(`Search failed: ${response.status}`);
        }
        
        const data = await response.json();
        displayDirectAPIResults(data);
        
    } catch (error) {
        console.error('Direct API search error:', error);
        const resultsContainer = document.querySelector('.ctw-window');
        if (resultsContainer) {
            resultsContainer.innerHTML = `
                <div style="text-align: center; color: #dc3545; padding: 20px;">
                    <strong>Search Error:</strong><br>
                    ${error.message}<br>
                    <small>Please try again or check your connection.</small>
                </div>
            `;
        }
    } finally {
        spinner.classList.add('hidden');
        searchButton.disabled = false;
        searchButton.textContent = 'Search';
    }
}

// Display results from direct API
function displayDirectAPIResults(data) {
    const resultsContainer = document.querySelector('.ctw-window');
    if (!resultsContainer) return;
    
    if (!data.destinationEntities || data.destinationEntities.length === 0) {
        resultsContainer.innerHTML = `
            <div style="text-align: center; color: #6c757d; padding: 20px;">
                <strong>No results found</strong><br>
                Try different search terms or check spelling.
            </div>
        `;
        return;
    }
    
    let html = '<div style="padding: 10px;"><h3>Search Results:</h3>';
    
    data.destinationEntities.forEach((entity, index) => {
        const title = entity.title || entity.label || 'Unknown';
        const code = entity.theCode || entity.code || 'N/A';
        const definition = entity.definition || '';
        
        html += `
            <div style="border: 1px solid #dee2e6; margin: 10px 0; padding: 15px; border-radius: 8px; cursor: pointer; background: #f8f9fa;" 
                 onclick="selectEntity('${code}', '${title.replace(/'/g, "\\'")}', '${entity.id || ''}')">
                <strong>${title}</strong><br>
                <small style="color: #6c757d;">Code: ${code}</small>
                ${definition ? `<br><small>${definition.substring(0, 100)}${definition.length > 100 ? '...' : ''}</small>` : ''}
            </div>
        `;
    });
    
    html += '</div>';
    resultsContainer.innerHTML = html;
}

// Handle entity selection
function selectEntity(code, title, id) {
    displaySelectedEntity({
        code: code,
        title: title,
        id: id
    });
}

// Define the settings for the Embedded Coding Tool.
const mySettings = {
    apiServerUrl: "https://id.who.int",
    apiSecured: true,
    autoBind: false, // Use custom search button instead of automatic searching
    popupMode: false, // Set to false for inline display
    chaptersAvailable: true,
    height: "500px",
    language: "en"
};

// Define the callbacks for the Embedded Coding Tool.
const myCallbacks = {
    // getNewTokenFunction is called by ECT to get a new access token
    getNewTokenFunction: async (callback) => {
        console.log("Requesting new access token from server...");
        try {
            const response = await fetch('/api/token', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                }
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            console.log("Token received successfully from server");
            callback(data.access_token);
            
        } catch (error) {
            console.error("Failed to fetch access token:", error);
            alert("Error: Could not authenticate with the ICD API. Make sure the server is running.");
            callback(null);
        }
    },

    // Called when a search starts
    searchStartedFunction: () => {
        console.log("Search started...");
        spinner.classList.remove('hidden');
        searchButton.disabled = true;
        searchButton.textContent = 'Searching...';
    },
    
    // Called when a search ends
    searchEndedFunction: () => {
        console.log("Search completed.");
        spinner.classList.add('hidden');
        searchButton.disabled = false;
        searchButton.textContent = 'Search';
    },

    // Called when user selects an entity from the search results
    selectedEntityFunction: (selectedEntity) => {
        console.log("Selected Entity Details:", selectedEntity);
        const code = selectedEntity.code || selectedEntity.theCode;
        const title = selectedEntity.title || selectedEntity.label;
        const browserUrl = selectedEntity.browserUrl;
        
        // Create a more detailed alert with the selected information
        let message = `Selected: ${title}`;
        if (code) message += `\nCode: ${code}`;
        if (browserUrl) message += `\nURL: ${browserUrl}`;
        
        alert(message);
        
        // You can also display this information in the UI instead of an alert
        displaySelectedEntity(selectedEntity);
    },

    // Called when there's an error
    errorFunction: (error) => {
        console.error("ECT Error:", error);
        spinner.classList.add('hidden');
        searchButton.disabled = false;
        searchButton.textContent = 'Search';
        alert("Search error: " + error.message || "Unknown error occurred");
    }
};

// Function to display selected entity details in the UI
function displaySelectedEntity(entity) {
    const resultsDiv = document.querySelector('.ctw-window-container');
    if (resultsDiv) {
        // Remove any existing selected entity display
        const existing = resultsDiv.querySelector('.selected-entity');
        if (existing) existing.remove();
        
        const detailsHtml = `
            <div class="selected-entity" style="margin-top: 20px; padding: 15px; background: #d4edda; border: 1px solid #c3e6cb; border-radius: 8px;">
                <h3 style="color: #155724; margin-top: 0;">✓ Selected Entity</h3>
                <p><strong>Title:</strong> ${entity.title || entity.label || 'N/A'}</p>
                <p><strong>Code:</strong> ${entity.code || entity.theCode || 'N/A'}</p>
                ${entity.definition ? `<p><strong>Definition:</strong> ${entity.definition}</p>` : ''}
                ${entity.browserUrl ? `<p><strong>More Info:</strong> <a href="${entity.browserUrl}" target="_blank">View in WHO Browser</a></p>` : ''}
            </div>
        `;
        resultsDiv.insertAdjacentHTML('beforeend', detailsHtml);
    }
}

// Function to handle the search action
const performSearch = () => {
    const query = searchInput.value.trim();
    if (query !== '') {
        console.log(`Performing search for: "${query}"`);
        
        // Clear any previous selected entity displays
        const existingSelected = document.querySelector('.selected-entity');
        if (existingSelected) {
            existingSelected.remove();
        }
        
        if (isECTAvailable && typeof ECT !== 'undefined' && ECT.Handler) {
            // Use ECT's programmatic search function
            ECT.Handler.search("1", query);
        } else {
            // Use direct API fallback
            searchDirectAPI(query);
        }
    } else {
        alert("Please enter a search term");
    }
};

// Function to check if ECT library is loaded
function checkECTLibrary() {
    return new Promise((resolve, reject) => {
        let attempts = 0;
        const maxAttempts = 20; // Wait up to 10 seconds
        
        const checkInterval = setInterval(() => {
            attempts++;
            console.log(`Checking ECT library... Attempt ${attempts}/${maxAttempts}`);
            
            if (typeof ECT !== 'undefined' && ECT.Handler && ECT.Handler.configure) {
                clearInterval(checkInterval);
                console.log("ECT library loaded successfully!");
                isECTAvailable = true;
                resolve();
            } else if (attempts >= maxAttempts) {
                clearInterval(checkInterval);
                console.error("ECT library failed to load after maximum attempts");
                isECTAvailable = false;
                reject(new Error("ECT library not available"));
            }
        }, 500); // Check every 500ms
    });
}

// Initialize the application
async function initializeApp() {
    try {
        console.log("Waiting for ECT library to load...");
        await checkECTLibrary();
        
        console.log("Configuring ECT Handler...");
        ECT.Handler.configure(mySettings, myCallbacks);
        console.log("ECT Handler configured successfully");
        
        // Enable the search functionality
        searchButton.disabled = false;
        searchInput.disabled = false;
        searchButton.textContent = 'Search';
        
    } catch (error) {
        console.error("ECT library not available, using direct API:", error);
        // Fall back to direct API implementation
        initializeDirectAPI();
    }
}

// Wait for DOM and start initialization
document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM loaded, starting initialization...");
    
    // Initially disable the search elements until library loads
    searchButton.disabled = true;
    searchInput.disabled = true;
    searchButton.textContent = 'Loading...';
    
    // Start initialization
    initializeApp();
});

// Add event listeners for the search functionality
searchButton.addEventListener('click', performSearch);
searchInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
        event.preventDefault(); // Prevent form submission
        performSearch();
    }
});

// Function to check if ECT library is loaded
function checkECTLibrary() {
    return new Promise((resolve, reject) => {
        let attempts = 0;
        const maxAttempts = 20; // Wait up to 10 seconds
        
        const checkInterval = setInterval(() => {
            attempts++;
            console.log(`Checking ECT library... Attempt ${attempts}/${maxAttempts}`);
            
            if (typeof ECT !== 'undefined' && ECT.Handler && ECT.Handler.configure) {
                clearInterval(checkInterval);
                console.log("ECT library loaded successfully!");
                resolve();
            } else if (attempts >= maxAttempts) {
                clearInterval(checkInterval);
                console.error("ECT library failed to load after maximum attempts");
                reject(new Error("ECT library not available"));
            }
        }, 500); // Check every 500ms
    });
}

// Initialize the application
async function initializeApp() {
    try {
        console.log("Waiting for ECT library to load...");
        await checkECTLibrary();
        
        console.log("Configuring ECT Handler...");
        ECT.Handler.configure(mySettings, myCallbacks);
        console.log("ECT Handler configured successfully");
        
        // Enable the search functionality
        searchButton.disabled = false;
        searchInput.disabled = false;
        searchButton.textContent = 'Search';
        
    } catch (error) {
        console.error("Failed to initialize ECT:", error);
        searchButton.textContent = 'Library Error';
        searchButton.disabled = true;
        
        // Show user-friendly error message
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.style.cssText = `
            background: #f8d7da;
            color: #721c24;
            padding: 12px;
            border: 1px solid #f5c6cb;
            border-radius: 8px;
            margin: 10px 0;
            text-align: center;
        `;
        errorDiv.innerHTML = `
            <strong>Error:</strong> ICD-11 library failed to load.<br>
            Please check your internet connection and refresh the page.<br>
            <small>If the problem persists, the WHO CDN might be temporarily unavailable.</small>
        `;
        
        const container = document.querySelector('.search-container');
        if (container) {
            container.appendChild(errorDiv);
        }
    }
}

// Wait for DOM and start initialization
document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM loaded, starting initialization...");
    
    // Initially disable the search elements until library loads
    searchButton.disabled = true;
    searchInput.disabled = true;
    searchButton.textContent = 'Loading...';
    
    // Start initialization
    initializeApp();
});