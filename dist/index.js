#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';
// —— Config from env / GitHub Action inputs ——
const PROJECT_IDS = process.env['INPUT_PROJECT_IDS'];
const OUTPUT_FILE = process.env['INPUT_OUTPUT_FILE'] || path.resolve(process.cwd(), 'data/catalyst-stats/stats.json');
// Debug logging
console.log('🔍 Environment variables:');
console.log(`  INPUT_PROJECT_IDS: ${process.env['INPUT_PROJECT_IDS']}`);
console.log(`  INPUT_OUTPUT_FILE: ${process.env['INPUT_OUTPUT_FILE']}`);
console.log('📊 Resolved values:');
console.log(`  PROJECT_IDS: ${PROJECT_IDS}`);
console.log(`  OUTPUT_FILE: ${OUTPUT_FILE}`);
// Netlify function configuration - hardcoded URLs
const triggerUrl = 'https://glittering-chebakia-09bd42.netlify.app/.netlify/functions/catalyst-proposals-background';
const statusUrl = 'https://glittering-chebakia-09bd42.netlify.app/api/catalyst/status';
const proposalsUrl = 'https://glittering-chebakia-09bd42.netlify.app/api/catalyst/proposals';
// Validate required inputs 
if (!PROJECT_IDS) {
    console.error('❌ INPUT_PROJECT_IDS must be set');
    process.exit(1);
}
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
// Helper function to make HTTP requests
async function makeRequest(url, options = {}) {
    try {
        console.log(`🌐 Making request to: ${url}`);
        const response = await fetch(url, {
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            ...options
        });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        // Check if response has content
        const contentType = response.headers.get('content-type');
        const text = await response.text();
        if (!text || text.trim() === '') {
            console.log('⚠️  Empty response received');
            return { success: true, message: 'Empty response' };
        }
        // Try to parse as JSON, but handle non-JSON responses gracefully
        try {
            const data = JSON.parse(text);
            console.log(`📊 Response data: ${JSON.stringify(data, null, 2)}`);
            return data;
        }
        catch (parseError) {
            console.log(`⚠️  Non-JSON response received: ${text.substring(0, 200)}...`);
            return { success: true, message: 'Non-JSON response', raw: text };
        }
    }
    catch (error) {
        console.error(`❌ Request failed: ${error instanceof Error ? error.message : String(error)}`);
        throw error;
    }
}
async function pollUntilComplete(ids, maxRetries = 30, interval = 10000) {
    console.log(`🔄 Starting polling with ${maxRetries} max attempts and ${interval}ms intervals`);
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        console.log(`🔄 Polling attempt ${attempt + 1}/${maxRetries}...`);
        const statusUrlWithParams = `${statusUrl}?projectIds=${encodeURIComponent(ids)}`;
        console.log(`🌐 Status URL: ${statusUrlWithParams}`);
        try {
            const statusData = await makeRequest(statusUrlWithParams);
            console.log(`📊 Status response: ${JSON.stringify(statusData, null, 2)}`);
            // Check if we have data and the status indicates completion
            if (statusData.hasData && (statusData.status === 'completed' || statusData.status === 'partial')) {
                console.log('✅ Data is available, fetching full proposals...');
                // Fetch full data from proposals endpoint
                const proposalsUrlWithParams = `${proposalsUrl}?projectIds=${encodeURIComponent(ids)}`;
                console.log(`🌐 Proposals URL: ${proposalsUrlWithParams}`);
                const proposalsData = await makeRequest(proposalsUrlWithParams);
                console.log(`📊 Full proposals data: ${JSON.stringify(proposalsData, null, 2)}`);
                return proposalsData.proposals;
            }
            console.log(`⏳ Waiting for results... (attempt ${attempt + 1}/${maxRetries})`);
            await sleep(interval);
        }
        catch (error) {
            console.error(`❌ Polling attempt ${attempt + 1} failed:`, error instanceof Error ? error.message : String(error));
            if (attempt === maxRetries - 1) {
                throw new Error('Polling timed out after all attempts.');
            }
            await sleep(interval);
        }
    }
    throw new Error('Polling timed out.');
}
async function main() {
    // PROJECT_IDS is guaranteed to be defined here due to the validation check above
    const projectIds = PROJECT_IDS;
    console.log(`🚀 Starting Catalyst stats collection for projects: ${projectIds}`);
    // Step 1: Trigger the background function
    console.log('📡 Triggering background function...');
    console.log(`🌐 Trigger URL: ${triggerUrl}`);
    console.log(`📦 Project IDs: ${projectIds}`);
    try {
        // Send project IDs as query parameters instead of request body
        const triggerUrlWithParams = `${triggerUrl}?projectIds=${encodeURIComponent(projectIds)}`;
        console.log(`🌐 Trigger URL with params: ${triggerUrlWithParams}`);
        const functionResponse = await makeRequest(triggerUrlWithParams, {
            method: 'POST'
        });
        console.log('✅ Background function triggered successfully');
        console.log(`📊 Function response: ${JSON.stringify(functionResponse, null, 2)}`);
        // If the response indicates success (even if it's not JSON), continue with polling
        if (functionResponse.success !== false) {
            console.log('✅ Background function appears to have been triggered successfully');
        }
    }
    catch (error) {
        console.error('❌ Failed to trigger background function:', error instanceof Error ? error.message : String(error));
        process.exit(1);
    }
    // Step 2: Poll for results
    console.log('⏳ Starting to poll for results...');
    const results = await pollUntilComplete(projectIds);
    // Step 3: Write results to file
    console.log('📝 Writing results to file...');
    const fullPath = path.resolve(process.cwd(), OUTPUT_FILE);
    console.log(`📁 Full output path: ${fullPath}`);
    try {
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        console.log(`✅ Created directory: ${path.dirname(fullPath)}`);
        await fs.writeFile(fullPath, JSON.stringify(results, null, 2));
        console.log(`✅ Results written to ${OUTPUT_FILE}`);
        console.log(`📊 Results size: ${JSON.stringify(results, null, 2).length} characters`);
    }
    catch (error) {
        console.error('❌ Failed to write results to file:', error instanceof Error ? error.message : String(error));
        process.exit(1);
    }
}
main().catch(err => {
    console.error('❌ Fatal error:', err instanceof Error ? err.message : String(err));
    process.exit(1);
});
