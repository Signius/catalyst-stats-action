import fs from 'fs/promises';
import path from 'path';
import fetch from 'node-fetch';

const projectIds = process.env.INPUT_PROJECT_IDS;
const outputFile = process.env.INPUT_OUTPUT_FILE;

const triggerUrl = 'https://your-site.netlify.app/.netlify/functions/processProjects';
const pollUrl = 'https://your-site.netlify.app/api/projectStatus';

const pollUntilComplete = async (ids, maxRetries = 30, interval = 10000) => {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const res = await fetch(`${pollUrl}?ids=${encodeURIComponent(ids)}`);
    if (!res.ok) throw new Error(`Polling failed: ${res.statusText}`);
    
    const data = await res.json();
    if (data.status === 'completed') return data.results;

    console.log(`⏳ Waiting for results... (attempt ${attempt + 1})`);
    await new Promise(res => setTimeout(res, interval));
  }

  throw new Error('Polling timed out.');
};

const main = async () => {
  console.log('📤 Triggering background function...');
  const triggerRes = await fetch(triggerUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectIds: projectIds.split(',') }),
  });

  if (!triggerRes.ok) throw new Error(`Trigger failed: ${triggerRes.statusText}`);
  console.log('🚀 Background function triggered.');

  const results = await pollUntilComplete(projectIds);
  const fullPath = path.resolve(process.cwd(), outputFile);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, JSON.stringify(results, null, 2));
  console.log(`✅ Results written to ${outputFile}`);
};

main().catch(err => {
  console.error(err);
  process.exit(1);
});
