import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import type { IncomingMessage, ServerResponse } from 'http'

const CF_API_ROOT = 'https://api.cloudflare.com/client/v4/accounts'

function readJsonBody(req: IncomingMessage): Promise<{ model: string; prompt: string }> {
  return new Promise((resolve, reject) => {
    let raw = ''
    req.on('data', (chunk) => {
      raw += String(chunk)
      if (raw.length > 64_000) reject(new Error('Request body is too large.'))
    })
    req.on('end', () => {
      try {
        const parsed = JSON.parse(raw || '{}') as { model?: unknown; prompt?: unknown }
        if (typeof parsed.model !== 'string' || typeof parsed.prompt !== 'string') {
          throw new Error('Both model and prompt are required.')
        }
        resolve({ model: parsed.model, prompt: parsed.prompt })
      } catch (error) {
        reject(error)
      }
    })
    req.on('error', reject)
  })
}

function buildUpstreamBody(model: string, prompt: string) {
  if (/flux-2-klein/i.test(model)) {
    // flux-2-klein requires multipart input, even for prompt-only requests.
    const form = new FormData()
    form.append('prompt', prompt)
    return { body: form, headers: { Accept: 'application/json, image/*' } }
  }
  return {
    body: JSON.stringify({ prompt }),
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, image/*',
    },
  }
}

function createProxyMiddleware(accountId: string, token: string) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

    if (req.method === 'OPTIONS') {
      res.statusCode = 204
      res.end()
      return
    }
    if (req.method !== 'POST') {
      res.statusCode = 405
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ success: false, errors: [{ message: 'Use POST.' }] }))
      return
    }

    try {
      if (!accountId || !token) {
        throw new Error('Set VITE_CF_ACCOUNT_ID and VITE_CF_AI_TOKEN in .env.')
      }
      const { model, prompt } = await readJsonBody(req)
      if (!/^@cf\/[a-z0-9-]+\/[a-z0-9._-]+$/i.test(model)) {
        throw new Error('Invalid Cloudflare Workers AI model.')
      }
      const { body, headers } = buildUpstreamBody(model, prompt)
      const upstream = await fetch(
        `${CF_API_ROOT}/${encodeURIComponent(accountId)}/ai/run/${model}`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, ...headers },
          body,
        }
      )
      const contentType = upstream.headers.get('content-type')
      res.statusCode = upstream.status
      if (contentType) res.setHeader('Content-Type', contentType)
      res.end(Buffer.from(await upstream.arrayBuffer()))
    } catch (error) {
      res.statusCode = 502
      res.setHeader('Content-Type', 'application/json')
      res.end(
        JSON.stringify({
          success: false,
          errors: [
            { message: error instanceof Error ? error.message : 'Proxy failed.' },
          ],
        })
      )
    }
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const accountId = (env.VITE_CF_ACCOUNT_ID || '').trim()
  const token = (env.VITE_CF_AI_TOKEN || '').trim()
  const proxyMiddleware = createProxyMiddleware(accountId, token)

  return {
    plugins: [
      react(),
      {
        name: 'cf-ai-image-proxy',
        configureServer(server) {
          server.middlewares.use('/api/cf-image', proxyMiddleware)
        },
        configurePreviewServer(server) {
          server.middlewares.use('/api/cf-image', proxyMiddleware)
        },
      },
    ],
  }
})
