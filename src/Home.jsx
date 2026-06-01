import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

export default function Home() {
  const [pages, setPages] = useState(null);

  useEffect(() => {
    fetch('/api/pages').then(r => r.json()).then(setPages);
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 p-8 flex flex-col items-center font-sans">
      <div className="w-full max-w-2xl">
        <h1 className="text-3xl font-extrabold text-slate-800 mb-8">Untitled Link Manager</h1>
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
            <h2 className="text-sm font-bold text-slate-500 uppercase">Sites</h2>
          </div>
          <div className="divide-y divide-slate-100">
            {pages === null ? (
              <p className="p-5 text-slate-400 text-sm">Loading…</p>
            ) : Object.keys(pages).length === 0 ? (
              <p className="p-5 text-slate-400 text-sm">No pages defined. Add entries to PAGES in config.js.</p>
            ) : (
              Object.entries(pages).map(([section, page]) => (
                <Link
                  key={section}
                  to={`/${section}`}
                  className="block p-5 hover:bg-blue-50/50 transition-colors group"
                >
                  <div className="flex justify-between items-center">
                    <span className="text-slate-700 group-hover:text-blue-700 font-medium">{page.title}</span>
                    <span className="text-xs font-medium text-slate-400 bg-slate-100 px-2 py-1 rounded">
                      /{section}
                    </span>
                  </div>
                  <p className="text-sm text-slate-400 mt-1 truncate">{page.mainUrl}</p>
                </Link>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
