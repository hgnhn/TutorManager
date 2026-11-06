import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles/tokens.css';
import './styles/app.css';
import { supabase } from './lib/supabase.js';
import App from './App.jsx';

createRoot(document.getElementById('root')).render(
  supabase ? (
    <App />
  ) : (
    <main className="page">
      <h1>Chưa cấu hình Supabase</h1>
      <p>
        Tạo file .env.local từ .env.example, điền VITE_SUPABASE_URL và VITE_SUPABASE_ANON_KEY, rồi chạy lại ứng dụng.
      </p>
    </main>
  ),
);
