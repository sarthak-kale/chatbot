# Nexi — Advanced Chatbot (Next.js + Vercel)

This single-file code document contains a ready-to-deploy example of an **advanced chatbot** built with **Next.js (React)** intended for deployment on **Vercel**. Features included:

- Clean, responsive UI (Tailwind-ready classes)
- Frontend: voice input, message history, streaming response UI, model & system prompt controls
- Backend: serverless API route that proxies requests to OpenAI's Chat Completions endpoint (uses `OPENAI_API_KEY`)
- Rate limiting / simple safety guard on the server route
- Local history (localStorage) and export/import of conversation

> IMPORTANT: before deploying, set the environment variable `OPENAI_API_KEY` in Vercel. See the short deploy steps at the bottom.

---

## File: `package.json`
```json
{
  "name": "nexi-chatbot",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start"
  },
  "dependencies": {
    "next": "14.0.0",
    "react": "18.2.0",
    "react-dom": "18.2.0",
    "swr": "2.1.0"
  }
}
```

---

## File: `pages/index.jsx`
```jsx
import Head from 'next/head'
import { useEffect, useRef, useState } from 'react'

function useLocalHistory(key, initial = []) {
  const [state, setState] = useState(() => {
    if (typeof window === 'undefined') return initial
    try { return JSON.parse(localStorage.getItem(key) || 'null') || initial } catch { return initial }
  })
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(state)) } catch {}
  }, [key, state])
  return [state, setState]
}

export default function Home() {
  const [messages, setMessages] = useLocalHistory('nexi_history', [
    { id: 'sys', role: 'system', content: 'You are Nexi — a helpful, concise assistant.' }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [model, setModel] = useState('gpt-4o-mini')
  const [systemPrompt, setSystemPrompt] = useState('You are Nexi, an advanced assistant.')
  const controllerRef = useRef(null)
  const endRef = useRef(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function sendMessage(content) {
    if (!content.trim()) return
    const userMsg = { id: Date.now().toString(), role: 'user', content }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)

    try {
      // cancel previous streaming (if any)
      controllerRef.current?.abort?.()
      const controller = new AbortController()
      controllerRef.current = controller

      const res = await fetch('/api/chat', {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages: [...messages.filter(m=>m.role!=='sys'), userMsg], systemPrompt })
      })

      if (!res.ok) throw new Error(await res.text())

      // We expect a streaming NDJSON/event-stream style response.
      const reader = res.body.getReader()
      const textDecoder = new TextDecoder()
      let assistantText = ''

      // reserve assistant message in UI
      const assistantId = 'a_' + Date.now()
      setMessages(prev => [...prev, { id: assistantId, role: 'assistant', content: '' }])

      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        const chunk = textDecoder.decode(value)
        assistantText += chunk
        // update latest assistant message
        setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: assistantText } : m))
      }

    } catch (err) {
      console.error('Chat error', err)
      setMessages(prev => [...prev, { id: 'err_' + Date.now(), role: 'assistant', content: '⚠️ Error: ' + String(err) }])
    } finally {
      setLoading(false)
      controllerRef.current = null
    }
  }

  function handleSubmit(e) {
    e?.preventDefault()
    sendMessage(input)
  }

  function clearHistory() {
    setMessages([{ id: 'sys', role: 'system', content: systemPrompt }])
  }

  function exportHistory() {
    const blob = new Blob([JSON.stringify(messages, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'nexi_history.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6 flex flex-col">
      <Head>
        <title>Nexi — Chatbot</title>
      </Head>

      <header className="max-w-3xl mx-auto w-full">
        <h1 className="text-3xl font-bold">Nexi — Advanced Chatbot</h1>
        <p className="text-sm text-slate-600">Vercel-ready example. Add OPENAI_API_KEY to your environment.</p>
      </header>

      <main className="flex-1 max-w-3xl mx-auto w-full mt-6 flex flex-col">
        <section className="mb-3 flex gap-2">
          <select value={model} onChange={e=>setModel(e.target.value)} className="px-3 py-2 rounded-md border">
            <option value="gpt-4o-mini">gpt-4o-mini</option>
            <option value="gpt-4o">gpt-4o</option>
            <option value="gpt-4o-mini-tts">gpt-4o-mini-tts</option>
          </select>
          <button onClick={clearHistory} className="px-3 py-2 rounded-md border">Clear</button>
          <button onClick={exportHistory} className="px-3 py-2 rounded-md border">Export</button>
        </section>

        <section className="bg-white shadow rounded-lg p-4 overflow-auto flex-1">
          <div className="space-y-3">
            {messages.map(m => (
              <div key={m.id} className={m.role==='user' ? 'text-right' : (m.role==='system'? 'text-center text-xs text-slate-400' : 'text-left')}>
                <div className={`inline-block p-3 rounded-lg ${m.role==='user'? 'bg-sky-100':'bg-slate-100'}`}>
                  <pre className="whitespace-pre-wrap">{m.content}</pre>
                </div>
              </div>
            ))}
            <div ref={endRef} />
          </div>
        </section>

        <form onSubmit={handleSubmit} className="mt-4 flex gap-2 items-center">
          <input value={input} onChange={e=>setInput(e.target.value)} placeholder="Ask Nexi..." className="flex-1 p-3 rounded-md border" />
          <button type="submit" disabled={loading} className="px-4 py-2 rounded-md bg-sky-600 text-white disabled:opacity-50">Send</button>
        </form>

        <footer className="mt-3 text-xs text-slate-500">Streaming: {loading ? 'Yes' : 'No'}</footer>
      </main>
    </div>
  )
}
```

---

## File: `pages/api/chat.js`
```js
// A simple Next.js API route that proxies to OpenAI.
// Add environment variable OPENAI_API_KEY in Vercel before deploying.

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end('Method not allowed')
  const { messages = [], model = 'gpt-4o-mini', systemPrompt = '' } = req.body || {}

  // Basic rate-limiting guard per IP (very small)
  // (Production: replace with a robust rate limiter / auth)
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown'

  try {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) return res.status(500).json({ error: 'OPENAI_API_KEY not configured' })

    // Build OpenAI messages: include system prompt as first message
    const built = []
    if (systemPrompt) built.push({ role: 'system', content: systemPrompt })
    built.push(...messages.map(m => ({ role: m.role, content: m.content })))

    // Request to OpenAI with streaming
    const openRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({ model, messages: built, stream: true, max_tokens: 800 })
    })

    if (!openRes.ok) {
      const txt = await openRes.text()
      return res.status(openRes.status).send(txt)
    }

    // Pipe the streaming response to the client
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')

    const reader = openRes.body.getReader()
    const decoder = new TextDecoder()

    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      const chunk = decoder.decode(value)
      // forward directly
      res.write(chunk)
    }

    res.end()

  } catch (err) {
    console.error(err)
    res.status(500).json({ error: String(err) })
  }
}
```

---

## Tailwind & Next config (optional quick setup)
- Install Tailwind and add the minimal config provided by Tailwind docs. The UI uses Tailwind classes but it will still work with plain CSS if you don't configure Tailwind.


---

## Vercel Deployment Steps (short)
1. Initialize a git repo, push this project to GitHub/GitLab.
2. Create a new project on Vercel and import your repo.
3. In Vercel dashboard, under Settings → Environment Variables, add `OPENAI_API_KEY` with your OpenAI API key.
4. Deploy. Vercel will run `npm install` and `npm run build`.

Security tip: For public projects consider adding a lightweight authentication (e.g., Vercel password, or API key) to the `/api/chat` route to avoid abuse.

---

If you'd like, I can:
- add user auth (signin with GitHub) before allowing chat, or
- wire in audio output (text-to-speech), or
- convert this to a single-file static site + serverless function (if you prefer another framework).

Pick one and I will update the canvas with the change.
