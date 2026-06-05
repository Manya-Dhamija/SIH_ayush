const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
const PORT = 3000;

// Your actual WHO ICD-11 credentials
const CLIENT_ID = "e6ddba9e-fc7e-4bc4-b447-ccd40ec7b06b_4964fb99-9d00-43d7-8219-e1b288b728d1";
const CLIENT_SECRET = "GlqdJLFHrCr8RMLwaueIgZczcofq5IGwt0sp6yHpdhs=";
const TOKEN_ENDPOINT = "https://icdaccessmanagement.who.int/connect/token";

// Enable CORS for all routes
app.use(cors());
app.use(express.json());

// Serve static files
app.use(express.static(__dirname));

// Token cache to avoid getting new tokens for every request
let tokenCache = {
    token: null,
    expires: null
};

// Endpoint to get ICD-11 access token
app.post('/api/token', async (req, res) => {
    try {
        console.log('Requesting new token from WHO...');
        
        // Check if we have a valid cached token
        if (tokenCache.token && tokenCache.expires && Date.now() < tokenCache.expires) {
            console.log('Returning cached token');
            return res.json({ access_token: tokenCache.token });
        }

        // Prepare form data for token request
        const params = new URLSearchParams();
        params.append('grant_type', 'client_credentials');
        params.append('client_id', CLIENT_ID);
        params.append('client_secret', CLIENT_SECRET);
        params.append('scope', 'icdapi_access');

        const response = await fetch(TOKEN_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: params
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        
        // Cache the token (WHO tokens typically expire in 1 hour)
        tokenCache.token = data.access_token;
        tokenCache.expires = Date.now() + (data.expires_in - 60) * 1000; // Expire 1 minute early
        
        console.log('New token received and cached');
        res.json({ access_token: data.access_token });
        
    } catch (error) {
        console.error('Error getting token:', error);
        res.status(500).json({ error: 'Failed to get access token' });
    }
});

// Endpoint to search ICD-11 codes
app.get('/api/search', async (req, res) => {
    try {
        const query = req.query.q;
        const includeTM = req.query.includeTM !== 'false'; // Default to true
        
        if (!query) {
            return res.status(400).json({ error: 'Query parameter required' });
        }

        console.log(`Search request: "${query}", Include TM: ${includeTM}`);

        // Get a fresh token
        const tokenResponse = await fetch(`http://localhost:${PORT}/api/token`, {
            method: 'POST'
        });
        const tokenData = await tokenResponse.json();
        
        if (!tokenData.access_token) {
            throw new Error('Failed to get access token');
        }

        console.log(`Searching for: "${query}"`);

        // Try multiple search strategies for better coverage
        let searchData = null;
        let searchUrl = '';

        try {
            // Strategy 1: Search in MMS linearization (main search)
            searchUrl = `https://id.who.int/icd/release/11/2025-01/mms/search?q=${encodeURIComponent(query)}&useFlexisearch=true&includeKeywordResult=true`;
            console.log('Trying MMS search (2025-01):', searchUrl);
            
            let searchResponse = await fetch(searchUrl, {
                headers: {
                    'Authorization': `Bearer ${tokenData.access_token}`,
                    'Accept': 'application/json',
                    'Accept-Language': 'en',
                    'API-Version': 'v2'
                }
            });

            if (searchResponse.ok) {
                searchData = await searchResponse.json();
                console.log('MMS search results:', searchData.destinationEntities?.length || 0, 'entities found');
            }

            // Strategy 2: Search specifically in Traditional Medicine using subtreesFilter for TM2
            if (includeTM && (!searchData?.destinationEntities?.length || searchData.destinationEntities.length < 3)) {
                console.log('Searching Traditional Medicine (TM2) using subtreesFilter...');
                
                // TM2 (Traditional Medicine Module 2) URI for Ayurveda, Siddha, and Unani
                const tm2Uri = 'http://id.who.int/icd/entity/718687701'; // TM2 root URI
                
                // Search in MMS with TM2 subtreesFilter
                searchUrl = `https://id.who.int/icd/release/11/2025-01/mms/search?q=${encodeURIComponent(query)}&useFlexisearch=true&subtreesFilter=${encodeURIComponent(tm2Uri)}&includeKeywordResult=true`;
                console.log('Trying MMS search with TM2 subtreesFilter:', searchUrl);
                
                searchResponse = await fetch(searchUrl, {
                    headers: {
                        'Authorization': `Bearer ${tokenData.access_token}`,
                        'Accept': 'application/json',
                        'Accept-Language': 'en',
                        'API-Version': 'v2'
                    }
                });

                console.log('TM2 subtreesFilter Response Status:', searchResponse.status, searchResponse.statusText);
                
                if (searchResponse.ok) {
                    const tm2Data = await searchResponse.json();
                    console.log('TM2 subtreesFilter results:', tm2Data.destinationEntities?.length || 0, 'entities found');
                    
                    if (tm2Data.destinationEntities?.length) {
                        console.log('🎉 SUCCESS! Found TM2 results using subtreesFilter');
                        console.log('First TM2 result:', JSON.stringify(tm2Data.destinationEntities[0], null, 2));
                        
                        // Combine results if we have both MMS and TM2 results
                        if (searchData?.destinationEntities?.length) {
                            searchData.destinationEntities = [...searchData.destinationEntities, ...tm2Data.destinationEntities];
                        } else {
                            searchData = tm2Data;
                        }
                    }
                } else {
                    const errorText = await searchResponse.text();
                    console.log('TM2 subtreesFilter search failed:', searchResponse.status, errorText.substring(0, 200));
                }
                
                // If still no results, try Foundation component with TM2 subtreesFilter
                if (!searchData?.destinationEntities?.length) {
                    searchUrl = `https://id.who.int/icd/release/11/2025-01/foundation/search?q=${encodeURIComponent(query)}&useFlexisearch=true&subtreesFilter=${encodeURIComponent(tm2Uri)}&includeKeywordResult=true`;
                    console.log('Trying Foundation search with TM2 subtreesFilter:', searchUrl);
                    
                    searchResponse = await fetch(searchUrl, {
                        headers: {
                            'Authorization': `Bearer ${tokenData.access_token}`,
                            'Accept': 'application/json',
                            'Accept-Language': 'en',
                            'API-Version': 'v2'
                        }
                    });
                    
                    if (searchResponse.ok) {
                        const foundationTm2Data = await searchResponse.json();
                        console.log('Foundation TM2 subtreesFilter results:', foundationTm2Data.destinationEntities?.length || 0, 'entities found');
                        
                        if (foundationTm2Data.destinationEntities?.length) {
                            console.log('🎉 SUCCESS! Found Foundation TM2 results');
                            console.log('First Foundation TM2 result:', JSON.stringify(foundationTm2Data.destinationEntities[0], null, 2));
                            searchData = foundationTm2Data;
                        }
                    } else {
                        console.log('Foundation TM2 subtreesFilter search failed:', searchResponse.status);
                    }
                }
            }

            // Strategy 3: If no results in MMS, try Foundation component search
            if (!searchData?.destinationEntities?.length) {
                searchUrl = `https://id.who.int/icd/release/11/2025-01/foundation/search?q=${encodeURIComponent(query)}&useFlexisearch=true`;
                console.log('Trying Foundation search (2025-01):', searchUrl);
                
                searchResponse = await fetch(searchUrl, {
                    headers: {
                        'Authorization': `Bearer ${tokenData.access_token}`,
                        'Accept': 'application/json',
                        'Accept-Language': 'en',
                        'API-Version': 'v2'
                    }
                });

                if (searchResponse.ok) {
                    const foundationData = await searchResponse.json();
                    console.log('Foundation search results:', foundationData.destinationEntities?.length || 0, 'entities found');
                    
                    if (foundationData.destinationEntities?.length) {
                        searchData = foundationData;
                    }
                }
            }

            // Strategy 4: If still no results, try character variations with TM2 subtreesFilter
            if (!searchData?.destinationEntities?.length) {
                // Try variations of the search term including Sanskrit character mappings
                const variations = [
                    query.replace(/ḥ/g, 'h'), // Replace special characters
                    query.replace(/ā/g, 'a'),
                    query.replace(/[āḥṃṅñṭḍṇśṣḷṛ]/g, match => {
                        const map = {'ā':'a', 'ḥ':'h', 'ṃ':'m', 'ṅ':'n', 'ñ':'n', 'ṭ':'t', 'ḍ':'d', 'ṇ':'n', 'ś':'s', 'ṣ':'s', 'ḷ':'l', 'ṛ':'r'};
                        return map[match] || match;
                    }),
                    // Add Sanskrit term meanings for tamaḥ
                    ...(query.toLowerCase().includes('tama') ? ['tamas', 'darkness', 'inertia', 'mental dullness'] : [])
                ].filter((variant, index, arr) => variant !== query && arr.indexOf(variant) === index); // Remove duplicates and original

                console.log('Trying character variants with TM2 subtreesFilter:', variations);

                for (const variant of variations) {
                    if (includeTM) {
                        // Try with TM2 subtreesFilter first
                        const tm2Uri = 'http://id.who.int/icd/entity/718687701';
                        searchUrl = `https://id.who.int/icd/release/11/2025-01/mms/search?q=${encodeURIComponent(variant)}&useFlexisearch=true&subtreesFilter=${encodeURIComponent(tm2Uri)}&includeKeywordResult=true`;
                        console.log(`Trying TM2 variant "${variant}":`, searchUrl);
                        
                        searchResponse = await fetch(searchUrl, {
                            headers: {
                                'Authorization': `Bearer ${tokenData.access_token}`,
                                'Accept': 'application/json',
                                'Accept-Language': 'en',
                                'API-Version': 'v2'
                            }
                        });

                        if (searchResponse.ok) {
                            const variantData = await searchResponse.json();
                            if (variantData.destinationEntities?.length) {
                                console.log(`🎉 TM2 variant search success for "${variant}":`, variantData.destinationEntities.length, 'entities found');
                                console.log('TM2 variant result:', JSON.stringify(variantData.destinationEntities[0], null, 2));
                                searchData = variantData;
                                break;
                            }
                        } else {
                            console.log(`TM2 variant search failed for "${variant}":`, searchResponse.status);
                        }
                    }
                    
                    // Fallback to regular MMS search if TM2 doesn't work
                    if (!searchData?.destinationEntities?.length) {
                        searchUrl = `https://id.who.int/icd/release/11/2025-01/mms/search?q=${encodeURIComponent(variant)}&useFlexisearch=true`;
                        console.log(`Trying regular variant "${variant}":`, searchUrl);
                        
                        searchResponse = await fetch(searchUrl, {
                            headers: {
                                'Authorization': `Bearer ${tokenData.access_token}`,
                                'Accept': 'application/json',
                                'Accept-Language': 'en',
                                'API-Version': 'v2'
                            }
                        });

                        if (searchResponse.ok) {
                            const variantData = await searchResponse.json();
                            if (variantData.destinationEntities?.length) {
                                console.log(`Regular variant search success for "${variant}":`, variantData.destinationEntities.length, 'entities found');
                                searchData = variantData;
                                break;
                            }
                        }
                    }
                    
                    if (searchData?.destinationEntities?.length) break;
                }
            }

        } catch (error) {
            console.error('Search error:', error);
            throw new Error(`Search failed! Error: ${error.message}`);
        }

        if (!searchData) {
            throw new Error('Search failed! No response data');
        }
        
        // Clean up the response data
        if (searchData.destinationEntities) {
            searchData.destinationEntities = searchData.destinationEntities.map(entity => {
                return {
                    ...entity,
                    title: cleanText(entity.title || ''),
                    label: cleanText(entity.label || ''),
                    definition: cleanText(entity.definition || ''),
                    theCode: cleanText(entity.theCode || ''),
                    code: cleanText(entity.code || '')
                };
            });
        }
        
        res.json(searchData);
        
    } catch (error) {
        console.error('Error searching:', error);
        res.status(500).json({ error: 'Search failed' });
    }
});

// New API v2.5 Describe endpoint for enhanced code analysis
app.get('/api/describe', async (req, res) => {
    try {
        const code = req.query.code;
        const uri = req.query.uri;
        
        if (!code && !uri) {
            return res.status(400).json({ error: 'Code or URI parameter required' });
        }

        console.log(`Describe request: code="${code}", uri="${uri}"`);

        // Get a fresh token
        const tokenResponse = await fetch(`http://localhost:${PORT}/api/token`, {
            method: 'POST'
        });
        const tokenData = await tokenResponse.json();
        
        if (!tokenData.access_token) {
            throw new Error('Failed to get access token');
        }

        // Build describe URL
        let describeUrl = 'https://id.who.int/icd/release/11/2025-01/mms/describe?';
        const params = new URLSearchParams();
        
        if (code) params.append('code', code);
        if (uri) params.append('uri', uri);
        
        describeUrl += params.toString();
        console.log('Trying Describe endpoint:', describeUrl);

        const describeResponse = await fetch(describeUrl, {
            headers: {
                'Authorization': `Bearer ${tokenData.access_token}`,
                'Accept': 'application/json',
                'Accept-Language': 'en',
                'API-Version': 'v2'
            }
        });

        if (!describeResponse.ok) {
            const errorText = await describeResponse.text();
            console.log('Describe failed:', describeResponse.status, errorText);
            
            // Handle 404 errors gracefully
            if (describeResponse.status === 404) {
                // Try alternative approaches for 404 errors
                console.log('Code not found in current linearization, trying alternative approaches...');
                
                // Try without the specific code, using just the URI if available
                if (uri) {
                    const altUrl = `https://id.who.int/icd/release/11/2025-01/mms/describe?uri=${encodeURIComponent(uri)}`;
                    console.log('Trying alternative describe with URI:', altUrl);
                    
                    const altResponse = await fetch(altUrl, {
                        headers: {
                            'Authorization': `Bearer ${tokenData.access_token}`,
                            'Accept': 'application/json',
                            'Accept-Language': 'en',
                            'API-Version': 'v2'
                        }
                    });
                    
                    if (altResponse.ok) {
                        const altData = await altResponse.json();
                        console.log('Alternative describe succeeded:', Object.keys(altData));
                        res.json(altData);
                        return;
                    }
                }
                
                // If all else fails, provide helpful information
                const fallbackData = {
                    code: code || 'Unknown',
                    uri: uri || 'Unknown',
                    label: `Information not available for code: ${code}`,
                    error: 'Code not found in current ICD-11 linearization',
                    suggestion: 'This code may exist in a different release or linearization',
                    alternatives: [
                        'Try searching for the condition name instead',
                        'Check if this is a valid ICD-11 code',
                        'The code might be from an older ICD version'
                    ]
                };
                
                res.json(fallbackData);
                return;
            }
            
            throw new Error(`Describe failed: ${describeResponse.status} ${errorText}`);
        }

        const describeData = await describeResponse.json();
        console.log('Describe results:', Object.keys(describeData));

        res.json(describeData);
        
    } catch (error) {
        console.error('Error in describe:', error);
        res.status(500).json({ error: 'Describe failed' });
    }
});

// Helper function to clean text
function cleanText(text) {
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
    text = text.replace(/&apos;/g, "'");
    
    // Remove extra whitespace and clean up
    text = text.replace(/\s+/g, ' ').trim();
    
    // Remove any remaining brackets or special formatting that might cause issues
    text = text.replace(/\[.*?\]/g, '');
    text = text.replace(/\{.*?\}/g, '');
    
    // Only filter out truly meaningless placeholder content
    const meaninglessTexts = [
        'n/a',
        'na',
        'null',
        'undefined',
        'none',
        '-',
        '...',
        ''
    ];
    
    const lowerText = text.toLowerCase();
    if (meaninglessTexts.some(meaningless => lowerText === meaningless)) {
        return '';
    }
    
    return text;
}

// Start the server
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log('Open your browser and go to http://localhost:3000');
});
