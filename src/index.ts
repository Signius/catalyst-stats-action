import fs from 'fs/promises'
import path from 'path'
import fetch from 'node-fetch'

const triggerUrl = 'https://your-site.netlify.app/.netlify/functions/processProjects'
const pollUrl = 'https://your-site.netlify.app/api/projectStatus'

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

async function pollUntilComplete(ids: string, maxRetries = 30, interval = 10000): Promise<unknown> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const response = await fetch(`${pollUrl}?ids=${encodeURIComponent(ids)}`)
    if (!response.ok) throw new Error(`Polling failed: ${response.statusText}`)
    const data = await response.json() as { status: string; results?: unknown }

    if (data.status === 'completed') return data.results

    console.log(`⏳ Waiting for results... (attempt ${attempt + 1})`)
    await sleep(interval)
  }

  throw new Error('Polling timed out.')
}

async function main(): Promise<void> {
  const projectIds = process.env['INPUT_PROJECT_IDS']
  const outputFile = process.env['INPUT_OUTPUT_FILE']

  if (!projectIds || !outputFile) {
    throw new Error('Missing required inputs.')
  }

  console.log('📤 Triggering background function...')
  const res = await fetch(triggerUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectIds: projectIds.split(',') }),
  })

  if (!res.ok) throw new Error(`Trigger failed: ${res.statusText}`)

  console.log('🚀 Background function triggered.')

  const results = await pollUntilComplete(projectIds)
  const fullPath = path.resolve(process.cwd(), outputFile)
  await fs.mkdir(path.dirname(fullPath), { recursive: true })
  await fs.writeFile(fullPath, JSON.stringify(results, null, 2))

  console.log(`✅ Results written to ${outputFile}`)
}

main().catch(err => {
  console.error('❌ Error:', err)
  process.exit(1)
})
