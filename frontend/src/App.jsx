import React, { useState, useEffect } from 'react'

export default function App() {
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState(null)
  const [contexts, setContexts] = useState([])
  const [file, setFile] = useState(null)
  const [status, setStatus] = useState('')
  
  // History states
  const [history, setHistory] = useState([])
  const [activeHistoryId, setActiveHistoryId] = useState(null)

  const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000/api'

  // Load history from localStorage on startup
  useEffect(() => {
    try {
      const savedHistory = localStorage.getItem('rag_chat_history')
      if (savedHistory) {
        const parsed = JSON.parse(savedHistory)
        setHistory(parsed)
        if (parsed.length > 0) {
          // Load the most recent conversation by default
          const latest = parsed[0]
          setActiveHistoryId(latest.id)
          setQuestion(latest.question)
          setAnswer(latest.answer)
          setContexts(latest.contexts || [])
        }
      }
    } catch (err) {
      console.error('Error loading history:', err)
    }
  }, [])

  // Helper to save history
  function saveHistory(newHistory) {
    setHistory(newHistory)
    try {
      localStorage.setItem('rag_chat_history', JSON.stringify(newHistory))
    } catch (err) {
      console.error('Error saving history:', err)
    }
  }

  async function handleUpload(e) {
    e.preventDefault()
    if (!file) return alert('Select a file to upload')
    setStatus('Uploading document...')
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch(`${API_BASE}/upload`, { method: 'POST', body: form })
      const data = await res.json()
      setStatus(data.message || 'Document indexed successfully!')
      setTimeout(() => setStatus(''), 3000)
    } catch (err) {
      console.error(err)
      setStatus('Upload failed')
    }
  }

  async function handleClearDatabase() {
    setStatus('Clearing backend database...')
    try {
      const res = await fetch(`${API_BASE}/clear`, { method: 'POST' })
      const data = await res.json()
      setStatus(data.message || 'Database cleared')
      setTimeout(() => setStatus(''), 3000)
    } catch (err) {
      console.error(err)
      setStatus('Clear failed')
    }
  }

  async function handleQuery(e) {
    e?.preventDefault()
    const trimmedQuestion = question.trim()
    if (!trimmedQuestion) return
    
    setStatus('Thinking...')
    setAnswer(null)
    setContexts([])
    try {
      const res = await fetch(`${API_BASE}/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: trimmedQuestion, top_k: 4 })
      })
      const data = await res.json()
      setAnswer(data.answer)
      setContexts(data.contexts || [])

      // Save to history
      const newHistoryItem = {
        id: Date.now(),
        question: trimmedQuestion,
        answer: data.answer,
        contexts: data.contexts || []
      }
      const updatedHistory = [newHistoryItem, ...history]
      saveHistory(updatedHistory)
      setActiveHistoryId(newHistoryItem.id)
    } catch (err) {
      console.error(err)
      setStatus('Error during query')
    } finally {
      setStatus('')
    }
  }

  function handleSelectHistory(id) {
    const item = history.find(h => h.id === id)
    if (item) {
      setActiveHistoryId(id)
      setQuestion(item.question)
      setAnswer(item.answer)
      setContexts(item.contexts || [])
    }
  }

  function handleClearHistory() {
    saveHistory([])
    setActiveHistoryId(null)
    setQuestion('')
    setAnswer(null)
    setContexts([])
  }

  function handleDeleteHistoryItem(e, id) {
    e.stopPropagation()
    const updatedHistory = history.filter(item => item.id !== id)
    saveHistory(updatedHistory)
    if (activeHistoryId === id) {
      if (updatedHistory.length > 0) {
        const nextActive = updatedHistory[0]
        setActiveHistoryId(nextActive.id)
        setQuestion(nextActive.question)
        setAnswer(nextActive.answer)
        setContexts(nextActive.contexts || [])
      } else {
        setActiveHistoryId(null)
        setQuestion('')
        setAnswer(null)
        setContexts([])
      }
    }
  }

  function handleNewChat() {
    setActiveHistoryId(null)
    setQuestion('')
    setAnswer(null)
    setContexts([])
  }

  function renderMarkdown(text) {
    if (!text) return '';
    const lines = text.split('\n');
    return lines.map((line, index) => {
      let processed = line;
      const isBullet = line.trim().startsWith('* ') || line.trim().startsWith('- ');
      if (isBullet) {
        processed = processed.replace(/^[\s]*[*-]\s+/, '');
      }
      processed = processed.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      processed = processed.replace(/\*([^*]+)\*/g, '<em>$1</em>');
      if (isBullet) {
        return (
          <li key={index} style={{ marginLeft: '1.5rem', listStyleType: 'disc', marginBottom: '0.25rem' }}>
            <span dangerouslySetInnerHTML={{ __html: processed }} />
          </li>
        );
      }
      return (
        <div key={index} style={{ minHeight: '1.2rem', marginBottom: '0.5rem' }}>
          <span dangerouslySetInnerHTML={{ __html: processed }} />
        </div>
      );
    });
  }

  return (
    <div className="app-container">
      {/* Sidebar for Chat History */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <h2 className="sidebar-title">RAG History</h2>
          <button className="btn-new-chat" onClick={handleNewChat}>
            <span className="plus-icon">+</span> New Chat
          </button>
        </div>
        
        <div className="history-list">
          {history.length === 0 ? (
            <div className="no-history">No past queries yet.</div>
          ) : (
            history.map(item => (
              <div 
                key={item.id} 
                className={`history-item ${activeHistoryId === item.id ? 'active' : ''}`}
                onClick={() => handleSelectHistory(item.id)}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}
              >
                <div className="history-text" style={{ flex: 1 }}>{item.question}</div>
                <button 
                  className="btn-delete-item" 
                  title="Delete Chat"
                  onClick={(e) => handleDeleteHistoryItem(e, item.id)}
                >
                  🗑️
                </button>
              </div>
            ))
          )}
        </div>

        {history.length > 0 && (
          <div className="sidebar-footer">
            <button className="btn-clear-history" onClick={handleClearHistory}>
              Clear History
            </button>
          </div>
        )}
      </aside>

      {/* Main Content Area */}
      <main className="main-content">
        {/* Top Header / Upload Panel */}
        <header className="main-header">
          <h1 className="main-title">RAG Assistant</h1>
          <div className="upload-section">
            <form onSubmit={handleUpload} className="upload-inline-form">
              <input
                type="file"
                accept=".txt,.md,.pdf"
                className="file-input-inline"
                onChange={e => setFile(e.target.files?.[0] ?? null)}
              />
              <div className="header-button-group">
                <button className="btn-inline-primary" type="submit">Upload</button>
                <button className="btn-inline-secondary" type="button" onClick={handleClearDatabase}>Reset DB</button>
              </div>
            </form>
          </div>
          {status && <div className="header-status">{status}</div>}
        </header>

        {/* Conversation Area */}
        <div className="chat-viewport">
          {answer === null && !status ? (
            <div className="chat-welcome">
              <div className="welcome-icon">💬</div>
              <h2>RAG Document Assistant</h2>
              <p>Upload a document (PDF, TXT, or MD) at the top, then ask any question about its content.</p>
            </div>
          ) : (
            <div className="chat-messages">
              {/* User Message Bubble */}
              {question && (
                <div className="message-row user-row">
                  <div className="message-bubble user-bubble">
                    <div className="message-label">You</div>
                    <div className="message-text">{question}</div>
                  </div>
                </div>
              )}

              {/* Assistant Message Bubble */}
              {answer !== null && (
                <div className="message-row assistant-row">
                  <div className="message-bubble assistant-bubble">
                    <div className="message-label">Assistant</div>
                    <div className="message-text">{renderMarkdown(answer)}</div>
                    
                    {contexts.length > 0 && (
                      <div className="message-contexts">
                        <div className="contexts-header">
                          💡 Retrieved Contexts ({contexts.length})
                        </div>
                        <ul className="contexts-list-inline">
                          {contexts.map((c, index) => (
                            <li key={`${c.id}-${index}`} className="context-bubble-item">
                              <div className="context-bubble-text">"{c.text}"</div>
                              <div className="context-bubble-meta">Score: {Number(c.score).toFixed(4)}</div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Input Bar */}
        <div className="chat-input-container">
          <form 
            onSubmit={handleQuery} 
            className="chat-input-form"
          >
            <textarea
              className="chat-input-textarea"
              rows={1}
              value={question}
              onChange={e => setQuestion(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleQuery();
                }
              }}
              placeholder="Ask a question about the uploaded document..."
            />
            <button className="btn-send" type="submit" disabled={status === 'Thinking...'}>
              Send
            </button>
          </form>
        </div>
      </main>
    </div>
  )
}