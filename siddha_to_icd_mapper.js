const XLSX = require('xlsx');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const fetch = require('node-fetch');
const path = require('path');

// Configuration
const EXCEL_FILE_PATH = './maping_siddha_to_icd/NATIONAL SIDDHA MORBIDITY CODES.xls';
const OUTPUT_CSV_PATH = './maping_siddha_to_icd/siddha_icd_mapping_results.csv';
const SERVER_URL = 'http://localhost:3000'; // Your local server
const DELAY_BETWEEN_REQUESTS = 1000; // 1 second delay between API calls

// Function to get access token
async function getAccessToken() {
    try {
        const response = await fetch(`${SERVER_URL}/api/token`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            }
        });
        
        if (!response.ok) {
            throw new Error(`Token request failed: ${response.status}`);
        }
        
        const data = await response.json();
        return data.access_token;
    } catch (error) {
        console.error('Error getting access token:', error);
        throw error;
    }
}

// Function to search ICD-11 for a term
async function searchICD11(term, token) {
    try {
        console.log(`🔍 Searching for: "${term}"`);
        
        const response = await fetch(`${SERVER_URL}/api/search?q=${encodeURIComponent(term)}&includeTM=true`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            }
        });

        if (!response.ok) {
            console.error(`❌ Search failed for "${term}": ${response.status}`);
            return null;
        }

        const data = await response.json();
        
        if (data.results && data.results.length > 0) {
            const firstResult = data.results[0];
            console.log(`✅ Found match: ${firstResult.theCode} - ${firstResult.title}`);
            return {
                code: firstResult.theCode,
                title: firstResult.title,
                score: firstResult.score || 0,
                chapter: firstResult.chapter || '',
                id: firstResult.id || ''
            };
        } else {
            console.log(`❌ No results found for: "${term}"`);
            return null;
        }
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
        
        // Find the column with Siddha terms (look for common patterns)
        let termColumnIndex = -1;
        const possibleTermColumns = ['name', 'term', 'siddha', 'disease', 'disorder', 'condition'];
        
        for (let i = 0; i < headers.length; i++) {
            const header = (headers[i] || '').toString().toLowerCase();
            if (possibleTermColumns.some(col => header.includes(col))) {
                termColumnIndex = i;
                break;
            }
        }
        
        if (termColumnIndex === -1) {
            console.log('⚠️  Could not automatically detect term column. Using first column.');
            termColumnIndex = 0;
        }
        
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
        console.log('🔑 Getting access token...');
        const token = await getAccessToken();
        console.log('✅ Access token obtained\n');
        
        // Process each term
        const results = [];
        let processedCount = 0;
        
        for (const row of dataRows) {
            processedCount++;
            console.log(`\n📝 Processing ${processedCount}/${dataRows.length}: "${row.siddha_term}"`);
            
            // Search for ICD-11 code
            const icdResult = await searchICD11(row.siddha_term, token);
            
            // Create result row
            const resultRow = {
                ...row, // Include all original data
                icd11_code: icdResult ? icdResult.code : 'NOT_FOUND',
                icd11_title: icdResult ? icdResult.title : 'No match found',
                icd11_score: icdResult ? icdResult.score : 0,
                icd11_chapter: icdResult ? icdResult.chapter : '',
                icd11_id: icdResult ? icdResult.id : '',
                mapping_status: icdResult ? 'SUCCESS' : 'NO_MATCH'
            };
            
            results.push(resultRow);
            
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
            { id: 'mapping_status', title: 'Mapping Status' }
        ];
        
        const csvWriter = createCsvWriter({
            path: OUTPUT_CSV_PATH,
            header: csvHeaders
        });
        
        await csvWriter.writeRecords(results);
        
        // Generate summary
        const successCount = results.filter(r => r.mapping_status === 'SUCCESS').length;
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
                console.log(`   "${mapping.siddha_term}" → ${mapping.icd11_code} (${mapping.icd11_title})`);
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