// Modern ICD-11 Medical Coding Assistant
// Direct API implementation without external dependencies

class MedicalCodingApp {
    constructor() {
        this.isLoading = false;
        this.searchResults = [];
        this.selectedCode = null;
        this.init();
    }

    init() {
        this.bindElements();
        this.attachEventListeners();
        this.initializeUI();
        this.checkServerConnection();
        console.log('Medical Coding App initialized');
    }

    initializeUI() {
        // Hide all sections initially
        this.loadingSection.classList.add('hidden');
        this.resultsSection.classList.add('hidden');
        this.selectedSection.classList.add('hidden');
        this.errorSection.classList.add('hidden');
        
        // Clear results count
        this.resultsCount.textContent = '';
    }

    bindElements() {
        // Get DOM elements
        this.searchInput = document.getElementById('medical-search');
        this.searchBtn = document.getElementById('search-btn');
        this.loadingSection = document.getElementById('loading-section');
        this.resultsSection = document.getElementById('results-section');
        this.resultsContainer = document.getElementById('results-container');
        this.resultsCount = document.getElementById('results-count');
        this.selectedSection = document.getElementById('selected-section');
        this.selectedContent = document.getElementById('selected-content');
        this.clearSelectionBtn = document.getElementById('clear-selection');
        this.errorSection = document.getElementById('error-section');
        this.errorMessage = document.getElementById('error-message');
        this.retryBtn = document.getElementById('retry-btn');
        this.statusIndicator = document.getElementById('connection-status');
        this.statusText = document.getElementById('status-text');
        this.suggestionTags = document.querySelectorAll('.suggestion-tag');
        this.tmFilter = document.getElementById('tm-filter');
        
        // Debug: Check if elements are found
        console.log('Element binding check:');
        console.log('resultsCount element:', this.resultsCount);
        console.log('resultsSection element:', this.resultsSection);
        console.log('resultsContainer element:', this.resultsContainer);
        console.log('tmFilter element:', this.tmFilter);
    }

    attachEventListeners() {
        // Search functionality
        this.searchBtn.addEventListener('click', () => this.performSearch());
        this.searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.performSearch();
            }
        });

        // Suggestion tags
        this.suggestionTags.forEach(tag => {
            tag.addEventListener('click', () => {
                const term = tag.getAttribute('data-term');
                this.searchInput.value = term;
                this.performSearch();
            });
        });

        // Clear selection
        this.clearSelectionBtn.addEventListener('click', () => this.clearSelection());

        // Retry button
        this.retryBtn.addEventListener('click', () => this.checkServerConnection());

        // Input focus effects
        this.searchInput.addEventListener('focus', () => {
            this.searchInput.parentElement.style.transform = 'scale(1.02)';
        });

        this.searchInput.addEventListener('blur', () => {
            this.searchInput.parentElement.style.transform = 'scale(1)';
        });
    }

    async checkServerConnection() {
        this.updateStatus('connecting', 'Connecting...');
        
        try {
            const response = await fetch('/api/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });

            if (response.ok) {
                this.updateStatus('connected', 'Connected');
                this.hideError();
                console.log('Server connection successful');
            } else {
                throw new Error(`Server responded with status: ${response.status}`);
            }
        } catch (error) {
            console.error('Server connection failed:', error);
            this.updateStatus('error', 'Connection Failed');
            this.showError('Unable to connect to the medical database server. Please ensure the server is running.');
        }
    }

    updateStatus(type, text) {
        this.statusIndicator.className = `status-indicator ${type}`;
        this.statusText.textContent = text;
    }

    async performSearch() {
        const query = this.searchInput.value.trim();
        
        if (!query) {
            this.showTemporaryMessage('Please enter a medical condition to search for');
            return;
        }

        if (this.isLoading) return;

        this.isLoading = true;
        this.showLoading();
        this.hideError();
        this.clearSelection();
        
        // Reset results section
        this.resultsSection.classList.add('hidden');
        this.resultsCount.textContent = '';

        try {
            console.log(`Searching for: "${query}"`);
            
            // Get Traditional Medicine filter state
            const includeTM = this.tmFilter ? this.tmFilter.checked : true;
            console.log('Include Traditional Medicine:', includeTM);
            
            const response = await fetch(`/api/search?q=${encodeURIComponent(query)}&includeTM=${includeTM}`);
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `Search failed with status: ${response.status}`);
            }

            const data = await response.json();
            this.displayResults(data, query);
            
        } catch (error) {
            console.error('Search error:', error);
            this.showError(`Search failed: ${error.message}`);
        } finally {
            this.isLoading = false;
            this.hideLoading();
        }
    }

    displayResults(data, query) {
        console.log('displayResults called with data:', data);
        this.searchResults = data.destinationEntities || [];
        console.log('searchResults array:', this.searchResults);
        console.log('Number of results:', this.searchResults.length);
        
        if (this.searchResults.length === 0) {
            console.log('No results found, calling showNoResults');
            this.showNoResults(query);
            return;
        }

        // Update results count dynamically
        const count = this.searchResults.length;
        const countText = `${count} result${count !== 1 ? 's' : ''} found`;
        console.log('Setting results count to:', countText);
        console.log('resultsCount element before update:', this.resultsCount);
        
        if (this.resultsCount) {
            this.resultsCount.textContent = countText;
            console.log('Results count updated successfully');
        } else {
            console.error('resultsCount element not found!');
        }
        
        this.resultsContainer.innerHTML = '';

        this.searchResults.forEach((entity, index) => {
            const resultCard = this.createResultCard(entity, index);
            this.resultsContainer.appendChild(resultCard);
        });

        this.showResults();
        console.log(`Found ${this.searchResults.length} results for "${query}"`);
    }

    createResultCard(entity, index) {
        const card = document.createElement('div');
        card.className = 'result-card';
        card.setAttribute('data-index', index);
        
        // Clean up the title and remove HTML tags
        let title = entity.title || entity.label || 'Unknown Condition';
        title = this.cleanText(title);
        
        // Clean up the code
        let code = entity.theCode || entity.code || 'No Code';
        code = this.cleanText(code);
        
        // Clean up the definition - preserve it if it exists
        let definition = this.cleanText(entity.definition || '');
        
        // Check for deprecated terms (API v2.5 feature)
        const isDeprecated = entity.deprecated || 
            (entity.synonym && entity.synonym.some(syn => syn.deprecated)) ||
            title.toLowerCase().includes('deprecated');
        
        if (isDeprecated) {
            card.classList.add('deprecated');
        }
        
        // Create the card content
        const titleDiv = document.createElement('div');
        titleDiv.className = 'result-title';
        titleDiv.textContent = title;
        
        // Add deprecated badge if needed
        if (isDeprecated) {
            const deprecatedBadge = document.createElement('span');
            deprecatedBadge.className = 'deprecated-badge';
            deprecatedBadge.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Deprecated';
            titleDiv.appendChild(deprecatedBadge);
        }
        
        const codeDiv = document.createElement('div');
        codeDiv.className = 'result-code';
        codeDiv.textContent = `ICD-11: ${code}`;
        
        // Add elements to card
        card.appendChild(titleDiv);
        card.appendChild(codeDiv);
        
        // Add description if it exists and has meaningful content (length > 3 to avoid very short meaningless text)
        if (definition && definition.length > 3) {
            const descDiv = document.createElement('div');
            descDiv.className = 'result-description';
            descDiv.textContent = this.truncateText(definition, 150);
            card.appendChild(descDiv);
        } else {
            // Add a placeholder to show that no description is available for this item
            const noDescDiv = document.createElement('div');
            noDescDiv.className = 'result-description';
            noDescDiv.style.fontStyle = 'italic';
            noDescDiv.style.color = '#94a3b8';
            noDescDiv.textContent = 'No description available';
            card.appendChild(noDescDiv);
        }

        // Add action buttons
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'result-actions';
        actionsDiv.style.cssText = 'margin-top: 1rem; display: flex; gap: 0.5rem; flex-wrap: wrap;';
        
        // Describe button (API v2.5 feature)
        const describeBtn = document.createElement('button');
        describeBtn.className = 'btn-describe';
        describeBtn.innerHTML = '<i class="fas fa-info-circle"></i> Describe';
        describeBtn.style.cssText = 'background: var(--secondary-color); color: white; border: none; padding: 0.5rem 1rem; border-radius: var(--radius-md); font-size: 0.75rem; cursor: pointer; transition: all 0.3s ease;';
        describeBtn.onclick = (e) => {
            e.stopPropagation(); // Prevent card selection
            this.describeCode(code, entity.uri || '');
        };
        
        // Copy button
        const copyBtn = document.createElement('button');
        copyBtn.className = 'btn-copy';
        copyBtn.innerHTML = '<i class="fas fa-copy"></i> Copy';
        copyBtn.style.cssText = 'background: var(--primary-color); color: white; border: none; padding: 0.5rem 1rem; border-radius: var(--radius-md); font-size: 0.75rem; cursor: pointer; transition: all 0.3s ease;';
        copyBtn.onclick = (e) => {
            e.stopPropagation(); // Prevent card selection
            navigator.clipboard.writeText(code);
            copyBtn.innerHTML = '<i class="fas fa-check"></i> Copied!';
            setTimeout(() => {
                copyBtn.innerHTML = '<i class="fas fa-copy"></i> Copy';
            }, 2000);
        };
        
        actionsDiv.appendChild(describeBtn);
        actionsDiv.appendChild(copyBtn);
        card.appendChild(actionsDiv);

        card.addEventListener('click', () => this.selectResult(entity));
        
        // Add entrance animation with staggered delay
        card.style.opacity = '0';
        card.style.transform = 'translateY(20px)';
        card.style.transition = 'all 0.4s ease';
        
        setTimeout(() => {
            card.style.opacity = '1';
            card.style.transform = 'translateY(0)';
        }, index * 50);

        return card;
    }

    // New API v2.5 Describe function
    async describeCode(code, uri = '') {
        try {
            console.log(`Describing code: ${code}, URI: ${uri}`);
            
            const params = new URLSearchParams();
            if (code) params.append('code', code);
            if (uri) params.append('uri', uri);
            
            const response = await fetch(`/api/describe?${params.toString()}`);
            
            if (!response.ok) {
                throw new Error(`Describe failed: ${response.status}`);
            }
            
            const describeData = await response.json();
            console.log('Describe results:', describeData);
            
            // Display detailed information in a modal or new section
            this.showDescribeResults(describeData);
            
        } catch (error) {
            console.error('Error describing code:', error);
            this.showTemporaryMessage('Failed to get detailed information for this code');
        }
    }

    showDescribeResults(data) {
        // Handle error cases gracefully
        const isError = data.error || data.suggestion;
        
        // Create a modal to show detailed code information
        const modal = document.createElement('div');
        modal.className = 'describe-modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2>${isError ? 'Code Information' : 'Detailed Code Information'}</h2>
                    <button class="close-modal" onclick="this.parentElement.parentElement.parentElement.remove()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    ${isError ? `
                        <div class="describe-section error-section">
                            <h3><i class="fas fa-exclamation-triangle"></i> Information Not Available</h3>
                            <p><strong>Code:</strong> ${data.code || 'N/A'}</p>
                            <p><strong>Issue:</strong> ${data.error || 'Unknown error'}</p>
                            <p><strong>Explanation:</strong> ${data.suggestion || 'No additional information available'}</p>
                            ${data.alternatives ? `
                                <h4>Suggestions:</h4>
                                <ul>
                                    ${data.alternatives.map(alt => `<li>${alt}</li>`).join('')}
                                </ul>
                            ` : ''}
                        </div>
                    ` : `
                        <div class="describe-section">
                            <h3>Basic Information</h3>
                            <p><strong>Code:</strong> ${data.code || 'N/A'}</p>
                            <p><strong>Label:</strong> ${data.label || 'N/A'}</p>
                            ${data.stemCode ? `<p><strong>Stem Code:</strong> ${data.stemCode}</p>` : ''}
                            ${data.stemLabel ? `<p><strong>Stem Label:</strong> ${data.stemLabel}</p>` : ''}
                        </div>
                        ${data.postcoordinationValues ? `
                            <div class="describe-section">
                                <h3>Postcoordination Values</h3>
                                ${data.postcoordinationValues.map(axis => `
                                    <div class="axis-info">
                                        <h4>${axis.axisName}</h4>
                                        ${axis.values.map(value => `
                                            <div class="axis-value">
                                                <p><strong>Code:</strong> ${value.code}</p>
                                                <p><strong>Label:</strong> ${value.label}</p>
                                            </div>
                                        `).join('')}
                                    </div>
                                `).join('')}
                            </div>
                        ` : ''}
                        <div class="describe-section">
                            <h3>URIs</h3>
                            ${data.foundationUri ? `<p><strong>Foundation URI:</strong> ${data.foundationUri}</p>` : ''}
                            ${data.linearizationUri ? `<p><strong>Linearization URI:</strong> ${data.linearizationUri}</p>` : ''}
                        </div>
                    `}
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Close modal when clicking outside
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });
    }

    selectResult(entity) {
        this.selectedCode = entity;
        
        // Clean up all text content
        let title = entity.title || entity.label || 'Unknown Condition';
        title = this.cleanText(title);
        
        let code = entity.theCode || entity.code || 'No Code';
        code = this.cleanText(code);
        
        let definition = entity.definition || '';
        definition = this.cleanText(definition);
        
        // Clear the container and create clean elements
        this.selectedContent.innerHTML = '';
        
        // Create title section
        const titleSection = document.createElement('div');
        titleSection.style.marginBottom = '1rem';
        
        const titleElement = document.createElement('h3');
        titleElement.style.cssText = 'font-size: 1.25rem; font-weight: 700; margin-bottom: 0.5rem;';
        titleElement.textContent = title;
        
        const codeElement = document.createElement('div');
        codeElement.style.cssText = 'font-size: 1rem; font-weight: 600; opacity: 0.9;';
        codeElement.textContent = `ICD-11 Code: ${code}`;
        
        // Add chapter information if available
        if (entity.chapter) {
            const chapterElement = document.createElement('div');
            chapterElement.style.cssText = 'font-size: 0.9rem; opacity: 0.8; margin-top: 0.25rem;';
            chapterElement.textContent = `Chapter: ${entity.chapter}`;
            titleSection.appendChild(titleElement);
            titleSection.appendChild(codeElement);
            titleSection.appendChild(chapterElement);
        } else {
            titleSection.appendChild(titleElement);
            titleSection.appendChild(codeElement);
        }
        
        this.selectedContent.appendChild(titleSection);
        
        // Only create definition section if definition exists and has content
        if (definition && definition.trim().length > 0) {
            const definitionSection = document.createElement('div');
            definitionSection.style.cssText = 'font-size: 0.95rem; line-height: 1.6; opacity: 0.9; margin-bottom: 1rem;';
            
            const defLabel = document.createElement('strong');
            defLabel.textContent = 'Definition:';
            
            const defText = document.createElement('div');
            defText.style.marginTop = '0.5rem';
            defText.textContent = definition;
            
            definitionSection.appendChild(defLabel);
            definitionSection.appendChild(defText);
            this.selectedContent.appendChild(definitionSection);
        }

        // Add matching PVs section if available
        if (entity.matchingPVs && entity.matchingPVs.length > 0) {
            const pvsSection = document.createElement('div');
            pvsSection.style.cssText = 'margin-top: 1.5rem; border-top: 2px solid rgba(255,255,255,0.3); padding-top: 1.5rem;';
            
            const pvsTitle = document.createElement('h4');
            pvsTitle.style.cssText = 'font-size: 1.1rem; font-weight: 600; margin-bottom: 1rem; color: #ffffff; text-shadow: 0 1px 2px rgba(0,0,0,0.3);';
            pvsTitle.textContent = 'Other Matching Properties';
            pvsSection.appendChild(pvsTitle);
            
            entity.matchingPVs.forEach((pv, index) => {
                const cleanLabel = this.cleanText(pv.label || '');
                if (cleanLabel && cleanLabel.length > 0) {
                    const pvItem = document.createElement('div');
                    pvItem.style.cssText = 'margin-bottom: 1rem; padding: 1rem; border: 2px solid rgba(255,255,255,0.2); border-radius: 0; background: rgba(255,255,255,0.03); box-shadow: 0 2px 4px rgba(0,0,0,0.2);';
                    
                    const pvHeader = document.createElement('div');
                    pvHeader.style.cssText = 'margin-bottom: 0.75rem;';
                    
                    const pvType = document.createElement('span');
                    pvType.style.cssText = 'font-size: 0.85rem; font-weight: 700; color: #000000; text-transform: uppercase; background: rgba(255,255,255,0.9); padding: 0.4rem 0.8rem; border-radius: 0; border: 1px solid rgba(0,0,0,0.1); box-shadow: 0 1px 2px rgba(0,0,0,0.1);';
                    pvType.textContent = pv.propertyId || 'Unknown';
                    
                    pvHeader.appendChild(pvType);
                    
                    const pvLabel = document.createElement('div');
                    pvLabel.style.cssText = 'font-size: 0.95rem; line-height: 1.5; color: #ffffff; margin-top: 0.75rem; font-weight: 500;';
                    pvLabel.textContent = cleanLabel;
                    
                    pvItem.appendChild(pvHeader);
                    pvItem.appendChild(pvLabel);
                    pvsSection.appendChild(pvItem);
                }
            });
            
            this.selectedContent.appendChild(pvsSection);
        }
        
        // Add browser URL if available
        if (entity.browserUrl) {
            const linkSection = document.createElement('div');
            linkSection.style.marginTop = '1rem';
            
            const link = document.createElement('a');
            link.href = entity.browserUrl;
            link.target = '_blank';
            link.style.cssText = 'color: white; text-decoration: underline; opacity: 0.9;';
            link.innerHTML = '<i class="fas fa-external-link-alt" style="margin-right: 0.5rem;"></i>View in WHO Browser';
            
            linkSection.appendChild(link);
            this.selectedContent.appendChild(linkSection);
        }

        this.showSelected();
        
        // Smooth scroll to selection
        this.selectedSection.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'center' 
        });

        console.log('Selected:', { title, code, hasDefinition: !!definition });
    }

    clearSelection() {
        this.selectedCode = null;
        this.hideSelected();
    }

    showLoading() {
        this.loadingSection.classList.remove('hidden');
        this.resultsSection.classList.add('hidden');
        this.errorSection.classList.add('hidden');
        this.searchBtn.innerHTML = `
            <span class="btn-text">Searching...</span>
            <i class="fas fa-spinner fa-spin btn-icon"></i>
        `;
        this.searchBtn.disabled = true;
    }

    hideLoading() {
        this.loadingSection.classList.add('hidden');
        this.searchBtn.innerHTML = `
            <span class="btn-text">Search</span>
            <i class="fas fa-arrow-right btn-icon"></i>
        `;
        this.searchBtn.disabled = false;
    }

    showResults() {
        console.log('showResults called');
        console.log('resultsSection element:', this.resultsSection);
        this.resultsSection.classList.remove('hidden');
        console.log('Results section should now be visible');
    }

    showSelected() {
        this.selectedSection.classList.remove('hidden');
    }

    hideSelected() {
        this.selectedSection.classList.add('hidden');
    }

    showNoResults(query) {
        const noResultsContainer = document.createElement('div');
        noResultsContainer.style.cssText = 'text-align: center; padding: 3rem; background: white; border-radius: 12px; border: 1px solid #e2e8f0;';
        
        const icon = document.createElement('i');
        icon.className = 'fas fa-search';
        icon.style.cssText = 'font-size: 3rem; color: #94a3b8; margin-bottom: 1rem; display: block;';
        
        const heading = document.createElement('h3');
        heading.style.cssText = 'color: #1e293b; margin-bottom: 0.5rem;';
        heading.textContent = 'No Results Found';
        
        const message = document.createElement('p');
        message.style.cssText = 'color: #64748b; margin-bottom: 1.5rem;';
        message.innerHTML = `No ICD-11 codes found for "<strong>${this.cleanText(query)}</strong>"`;
        
        const suggestions = document.createElement('div');
        suggestions.style.cssText = 'font-size: 0.875rem; color: #64748b;';
        suggestions.innerHTML = `
            <strong>Try:</strong>
            <ul style="list-style: none; padding: 0; margin: 0.5rem 0;">
                <li>• Different spelling or synonyms</li>
                <li>• More general terms</li>
                <li>• Medical terminology</li>
            </ul>
        `;
        
        noResultsContainer.appendChild(icon);
        noResultsContainer.appendChild(heading);
        noResultsContainer.appendChild(message);
        noResultsContainer.appendChild(suggestions);
        
        this.resultsContainer.innerHTML = '';
        this.resultsContainer.appendChild(noResultsContainer);
        
        this.resultsCount.textContent = '0 results found';
        this.showResults();
    }

    showError(message) {
        this.errorMessage.textContent = message;
        this.errorSection.classList.remove('hidden');
        this.resultsSection.classList.add('hidden');
        this.loadingSection.classList.add('hidden');
        // Clear results count when showing error
        this.resultsCount.textContent = '';
    }

    hideError() {
        this.errorSection.classList.add('hidden');
    }

    showTemporaryMessage(message) {
        // Create temporary notification
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 100px;
            left: 50%;
            transform: translateX(-50%);
            background: #3b82f6;
            color: white;
            padding: 1rem 2rem;
            border-radius: 8px;
            font-weight: 600;
            z-index: 1000;
            box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
            transition: all 0.3s ease;
        `;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        // Animate in
        requestAnimationFrame(() => {
            notification.style.transform = 'translateX(-50%) translateY(0)';
        });
        
        // Remove after 3 seconds
        setTimeout(() => {
            notification.style.transform = 'translateX(-50%) translateY(-100px)';
            notification.style.opacity = '0';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 3000);
    }

    cleanText(text) {
        if (!text) return '';
        
        // Remove HTML tags
        text = text.replace(/<[^>]*>/g, '');
        
        // Remove special HTML entities
        text = text.replace(/&nbsp;/g, ' ');
        text = text.replace(/&amp;/g, '&');
        text = text.replace(/&lt;/g, '<');
        text = text.replace(/&gt;/g, '>');
        text = text.replace(/&quot;/g, '"');
        text = text.replace(/&#039;/g, "'");
        
        // Remove extra whitespace and clean up
        text = text.replace(/\s+/g, ' ').trim();
        
        // Remove any remaining brackets or special formatting
        text = text.replace(/\[.*?\]/g, '');
        text = text.replace(/\{.*?\}/g, '');
        
        // Only remove text if it's truly meaningless placeholders, not real content
        const meaninglessTexts = [
            'n/a',
            'na',
            'none',
            'null',
            'undefined',
            ''
        ];
        
        const lowerText = text.toLowerCase();
        if (meaninglessTexts.includes(lowerText)) {
            return '';
        }
        
        return text;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    truncateText(text, maxLength) {
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...';
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing Medical Coding App...');
    window.medicalApp = new MedicalCodingApp();
});

// Handle page visibility changes
document.addEventListener('visibilitychange', () => {
    if (!document.hidden && window.medicalApp) {
        // Check connection when page becomes visible
        window.medicalApp.checkServerConnection();
    }
});
