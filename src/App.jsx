import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, useParams, Navigate } from 'react-router-dom';
import Home from './Home.jsx';
import Dashboard from './Dashboard.jsx';

function PageRouter() {
  const { section } = useParams();
  const [page, setPage] = useState(undefined);
  const [isStatic, setIsStatic] = useState(false);

  useEffect(() => {
    fetch('/api/pages')
      .then(r => r.json())
      .then(data => {
        if (data[section]) {
          const p = data[section];
          setPage(p);
          if (p.type === 'static' && p.mainUrl && p.mainUrl !== 'no_permanent_url_yet') {
            setIsStatic(true);
            window.location.href = p.mainUrl;
          }
        } else {
          setPage(null);
        }
      });
  }, [section]);

  if (isStatic) return null;
  if (page === undefined) return <div className="min-h-screen bg-slate-50 flex items-center justify-center"><p className="text-slate-400">Loading…</p></div>;
  if (page === null) return <Navigate to="/" replace />;

  return <Dashboard />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/:section" element={<PageRouter />} />
      </Routes>
    </BrowserRouter>
  );
}