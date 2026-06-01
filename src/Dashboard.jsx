import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';

export default function Dashboard() {
  const { section } = useParams();
  const [page, setPage] = useState(undefined); // undefined=loading, null=not-found, obj=loaded
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);
  const [logs, setLogs] = useState([]);
  const [showBookmark, setShowBookmark] = useState(false);
  const logsEndRef = useRef(null);

  useEffect(() => {
    if (page && page.googledoc) {
      const dismissed = localStorage.getItem(`bookmark-prompt-${section}`);
      if (!dismissed) setShowBookmark(true);
    }
  }, [page, section]);

  const dismissBookmark = () => {
    localStorage.setItem(`bookmark-prompt-${section}`, '1');
    setShowBookmark(false);
  };

  const loadPage = useCallback(() => {
    return fetch('/api/pages')
      .then(r => r.json())
      .then(data => setPage(data[section] !== undefined ? data[section] : null));
  }, [section]);

  useEffect(() => { loadPage(); }, [loadPage]);

  useEffect(() => {
    if (logsEndRef.current) logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const handleGenerate = () => {
    setGenerating(true);
    setError(null);
    setLogs([]);

    const source = new EventSource(`/api/pages/${section}/generate`);

    source.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === 'log') {
        setLogs(prev => [...prev, msg.text]);
      } else if (msg.type === 'url') {
        source.close();
        loadPage().then(() => setGenerating(false));
      } else if (msg.type === 'error') {
        source.close();
        setError(msg.message);
        setGenerating(false);
      }
    };

    source.onerror = () => {
      source.close();
      setError('Lost connection to server');
      setGenerating(false);
    };
  };

  if (page === undefined) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-slate-400">Loading…</p>
      </div>
    );
  }

  if (page === null) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center font-sans">
        <div className="text-center">
          <p className="text-slate-500 mb-4">Page not found.</p>
          <Link to="/" className="text-blue-500 hover:underline text-sm">← Back to all sites</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-8 flex flex-col items-center font-sans">
      {showBookmark && page.googledoc && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
            <h2 className="text-xl font-bold text-slate-800 mb-2">Bookmark the Google Doc</h2>
            <p className="text-sm text-slate-600 mb-5">
              The document is harder to block, and thus more likely to stay accessible if you bookmark it and access it directly when needed.
            </p>
            <div className="flex gap-3">
              <a
                href={page.googledoc}
                target="_blank"
                rel="noopener noreferrer"
                onClick={dismissBookmark}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2 rounded-lg text-center transition-colors"
              >
                Open doc
              </a>
              <button
                onClick={dismissBookmark}
                className="px-4 py-2 text-slate-500 hover:text-slate-800 font-medium transition-colors"
              >
                Don't show again
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="w-full max-w-2xl">

        <div className="mb-2">
          <Link to="/" className="text-sm text-slate-400 hover:text-blue-500 transition-colors">← All sites</Link>
        </div>

        <div className="mb-6">
          <h1 className="text-3xl font-extrabold text-slate-800">{page.title}</h1>
        </div>

        <div className="flex gap-3 mb-4">
          <a
            href={page.mainUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 bg-white border border-slate-200 rounded-lg px-4 py-3 shadow-sm hover:border-blue-400 transition-colors flex items-center text-blue-600 font-medium truncate"
          >
            {page.mainUrl}
          </a>
          {page.type === 'generatable' && (
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="bg-slate-900 hover:bg-black disabled:opacity-60 text-white px-8 py-3 rounded-lg font-semibold transition-all shadow-md whitespace-nowrap"
            >
              {generating ? 'Generating…' : 'Generate link'}
            </button>
          )}
          {page.type === 'cycling' && (
            <div className="bg-slate-900 text-white px-8 py-3 rounded-lg font-semibold text-sm flex items-center">
              Auto-cycling (3h)
            </div>
          )}
        </div>

        {generating && (
          <div className="mb-4 bg-slate-900 rounded-lg p-4 font-mono text-xs text-green-400 max-h-48 overflow-y-auto">
            {logs.length === 0
              ? <p className="text-slate-500">Waiting for output…</p>
              : logs.map((line, i) => <p key={i} className="whitespace-pre-wrap break-all">{line}</p>)
            }
            <div ref={logsEndRef} />
          </div>
        )}
        {error && (
          <p className="text-sm text-red-500 mb-4">{error}</p>
        )}

        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
            <h2 className="text-sm font-bold text-slate-500 uppercase">Segments</h2>
          </div>
          <div className="divide-y divide-slate-100">
            {page.segments.length === 0 ? (
              <p className="p-5 text-slate-400 text-sm">No segments yet. Click "Generate link" to create one.</p>
            ) : (
              page.segments.map((segment) => {
                const formatTime = (timestamp) => {
                  const date = new Date(timestamp);
                  return date.toLocaleString();
                };
                const createdTime = formatTime(segment.id);
                const expiresTime = segment.expiresAt ? formatTime(segment.expiresAt) : null;
                
                return (
                  <a
                    key={segment.id}
                    href={segment.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block p-5 hover:bg-blue-50/50 transition-colors group"
                  >
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-slate-700 group-hover:text-blue-700 truncate text-sm">{segment.url}</span>
                    </div>
                    <div className="flex gap-3 flex-wrap">
                      <span className="text-xs font-medium text-slate-400 bg-slate-100 px-2 py-1 rounded whitespace-nowrap">
                        Created: {createdTime}
                      </span>
                      {expiresTime && (
                        <span className="text-xs font-medium text-amber-600 bg-amber-50 px-2 py-1 rounded whitespace-nowrap">
                          Expires: {expiresTime}
                        </span>
                      )}
                    </div>
                  </a>
                );
              })
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
