const XLSX = require('xlsx');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const fetch = require('node-fetch');
const path = require('path');

// Configuration
const EXCEL_FILE_PATH = './maping_siddha_to_icd/NATIONAL SIDDHA MORBIDITY CODES.xls';
const OUTPUT_CSV_PATH = './maping_siddha_to_icd/siddha_icd_mapping_results.csv';

// Your actual WHO ICD-11 credentials (from server.js)
const CLIENT_ID = "e6ddba9e-fc7e-4bc4-b447-ccd40ec7b06b_4964fb99-9d00-43d7-8219-e1b288b728d1";
const CLIENT_SECRET = "GlqdJLFHrCr8RMLwaueIgZczcofq5IGwt0sp6yHpdhs=";
const TOKEN_ENDPOINT = "https://icdaccessmanagement.who.int/connect/token";
const ICD_API_BASE = "https://id.who.int/icd/release/11/2025-01";

const DELAY_BETWEEN_REQUESTS = 2000; // 2 second delay between API calls

// Token cache to avoid getting new tokens for every request
let tokenCache = {
    token: null,
    expires: null
};

// Function to get access token directly from WHO
async function getAccessToken() {
    try {
        console.log('🔑 Requesting new token from WHO...');
        
        // Check if we have a valid cached token
        if (tokenCache.token && tokenCache.expires && Date.now() < tokenCache.expires) {
            console.log('✅ Returning cached token');
            return tokenCache.token;
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
            throw new Error(`Token request failed: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        
        // Cache the token (expires in 1 hour, so cache for 50 minutes)
        tokenCache.token = data.access_token;
        tokenCache.expires = Date.now() + (50 * 60 * 1000); // 50 minutes
        
        console.log('✅ New token received and cached');
        return data.access_token;
        
    } catch (error) {
        console.error('❌ Error getting access token:', error);
        throw error;
    }
}

// Function to search ICD-11 for a term
async function searchICD11(term, token) {
    try {
        console.log(`🔍 Searching for: "${term}"`);
        
        // Try main MMS search first
        const mmsUrl = `${ICD_API_BASE}/mms/search?q=${encodeURIComponent(term)}&useFlexisearch=true&includeKeywordResult=true`;
        
        let response = await fetch(mmsUrl, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json',
                'API-Version': 'v2',
                'Accept-Language': 'en'
            }
        });

        if (!response.ok) {
            console.error(`❌ MMS search failed for "${term}": ${response.status}`);
            return null;
        }

        let data = await response.json();
        
        if (data.destinationEntities && data.destinationEntities.length > 0) {
            const firstResult = data.destinationEntities[0];
            console.log(`✅ Found MMS match: ${firstResult.theCode} - ${firstResult.title}`);
            return {
                code: firstResult.theCode,
                title: firstResult.title,
                score: firstResult.score || 0,
                chapter: firstResult.chapter || '',
                id: firstResult.id || '',
                source: 'MMS'
            };
        }

        // If no MMS results, try Traditional Medicine (TM2) search
        console.log('🌿 Trying Traditional Medicine (TM2) search...');
        const tm2Url = `${ICD_API_BASE}/mms/search?q=${encodeURIComponent(term)}&useFlexisearch=true&subtreesFilter=http%3A%2F%2Fid.who.int%2Ficd%2Fentity%2F718687701&includeKeywordResult=true`;
        
        response = await fetch(tm2Url, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json',
                'API-Version': 'v2',
                'Accept-Language': 'en'
            }
        });

        if (response.ok) {
            data = await response.json();
            if (data.destinationEntities && data.destinationEntities.length > 0) {
                const firstResult = data.destinationEntities[0];
                console.log(`✅ Found TM2 match: ${firstResult.theCode} - ${firstResult.title}`);
                return {
                    code: firstResult.theCode,
                    title: firstResult.title,
                    score: firstResult.score || 0,
                    chapter: firstResult.chapter || '',
                    id: firstResult.id || '',
                    source: 'TM2'
                };
            }
        }

        console.log(`❌ No results found for: "${term}"`);
        return null;

    } catch (error) {
        console.error(`❌ Error searching for "${term}":`, error.message);
        return null;
    }
}

// Function to delay execution
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Function to read Excel file and extract data
function readExcelFile(filePath) {
    try {
        console.log('📖 Reading Excel file...');
        const workbook = XLSX.readFile(filePath);
        const sheetName = workbook.SheetNames[0]; // Get first sheet
        const worksheet = workbook.Sheets[sheetName];
        
        // Convert to JSON
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        
        console.log(`📋 Found ${jsonData.length} rows in Excel file`);
        
        // Find column headers
        const headers = jsonData[0];
        console.log('📊 Headers found:', headers);
        
        // Find the NAMC_TERM column (column index 3)
        const termColumnIndex = 3; // NAMC_TERM is in column 3
        
        console.log(`🎯 Using column ${termColumnIndex} (${headers[termColumnIndex]}) for Siddha terms`);
        
        // Extract data rows (skip header)
        const dataRows = [];
        for (let i = 1; i < jsonData.length; i++) {
            const row = jsonData[i];
            if (row && row[termColumnIndex] && row[termColumnIndex].toString().trim()) {
                const rowData = {};
                headers.forEach((header, index) => {
                    rowData[header || `Column_${index}`] = row[index] || '';
                });
                rowData.siddha_term = row[termColumnIndex].toString().trim();
                dataRows.push(rowData);
            }
        }
        
        console.log(`✅ Extracted ${dataRows.length} valid Siddha terms`);
        return { headers, dataRows };
        
    } catch (error) {
        console.error('❌ Error reading Excel file:', error);
        throw error;
    }
}

// Function to process all terms and create CSV
async function processSiddhaTerms() {
    try {
        console.log('🚀 Starting Siddha to ICD-11 mapping process...\n');
        
        // Read Excel file
        const { headers, dataRows } = readExcelFile(EXCEL_FILE_PATH);
        
        if (dataRows.length === 0) {
            console.log('❌ No data found in Excel file');
            return;
        }
        
        // Get access token
        const token = await getAccessToken();
        
        // Process each term
        const results = [];
        let processedCount = 0;
        let successCount = 0;
        
        for (const row of dataRows) {
            processedCount++;
            console.log(`\n📝 Processing ${processedCount}/${dataRows.length}: "${row.siddha_term}"`);
            
            // Search for ICD-11 code
            const icdResult = await searchICD11(row.siddha_term, token);
            
            if (icdResult) {
                successCount++;
            }
            
            // Create result row
            const resultRow = {
                ...row, // Include all original data
                icd11_code: icdResult ? icdResult.code : 'NOT_FOUND',
                icd11_title: icdResult ? icdResult.title : 'No match found',
                icd11_score: icdResult ? icdResult.score : 0,
                icd11_chapter: icdResult ? icdResult.chapter : '',
                icd11_id: icdResult ? icdResult.id : '',
                icd11_source: icdResult ? icdResult.source : '',
                mapping_status: icdResult ? 'SUCCESS' : 'NO_MATCH'
            };
            
            results.push(resultRow);
            
            // Show progress every 10 items
            if (processedCount % 10 === 0) {
                const successRate = ((successCount / processedCount) * 100).toFixed(1);
                console.log(`📊 Progress: ${processedCount}/${dataRows.length} (${successRate}% success rate)`);
            }
            
            // Add delay between requests to avoid overwhelming the API
            if (processedCount < dataRows.length) {
                console.log(`⏳ Waiting ${DELAY_BETWEEN_REQUESTS}ms before next request...`);
                await delay(DELAY_BETWEEN_REQUESTS);
            }
        }
        
        // Create CSV with results
        console.log('\n📝 Creating CSV file with results...');
        
        // Prepare headers for CSV
        const csvHeaders = [
            ...headers.map(h => ({ id: h || 'unknown', title: h || 'Unknown' })),
            { id: 'siddha_term', title: 'Siddha Term' },
            { id: 'icd11_code', title: 'ICD-11 Code' },
            { id: 'icd11_title', title: 'ICD-11 Title' },
            { id: 'icd11_score', title: 'Match Score' },
            { id: 'icd11_chapter', title: 'ICD-11 Chapter' },
            { id: 'icd11_id', title: 'ICD-11 ID' },
            { id: 'icd11_source', title: 'ICD-11 Source' },
            { id: 'mapping_status', title: 'Mapping Status' }
        ];
        
        const csvWriter = createCsvWriter({
            path: OUTPUT_CSV_PATH,
            header: csvHeaders
        });
        
        await csvWriter.writeRecords(results);
        
        // Generate summary
        const failureCount = results.length - successCount;
        
        console.log('\n🎉 MAPPING COMPLETE!');
        console.log('═══════════════════════════════════════');
        console.log(`📊 Total terms processed: ${results.length}`);
        console.log(`✅ Successfully mapped: ${successCount}`);
        console.log(`❌ No matches found: ${failureCount}`);
        console.log(`📈 Success rate: ${((successCount / results.length) * 100).toFixed(1)}%`);
        console.log(`📄 Results saved to: ${OUTPUT_CSV_PATH}`);
        console.log('═══════════════════════════════════════');
        
        // Show some example mappings
        const successfulMappings = results.filter(r => r.mapping_status === 'SUCCESS').slice(0, 5);
        if (successfulMappings.length > 0) {
            console.log('\n🌟 Example successful mappings:');
            successfulMappings.forEach(mapping => {
                console.log(`   "${mapping.siddha_term}" → ${mapping.icd11_code} (${mapping.icd11_title}) [${mapping.icd11_source}]`);
            });
        }
        
    } catch (error) {
        console.error('❌ Error in processing:', error);
        throw error;
    }
}

// Main execution
if (require.main === module) {
    processSiddhaTerms()
        .then(() => {
            console.log('\n✨ Script completed successfully!');
            process.exit(0);
        })
        .catch((error) => {
            console.error('\n💥 Script failed:', error);
            process.exit(1);
        });
}

module.exports = { processSiddhaTerms, searchICD11, getAccessToken };