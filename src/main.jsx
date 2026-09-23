import React from 'react';
import { createRoot } from 'react-dom/client';
// Design tokens live in design/tokens.css — the single source, not copied here.
import '../design/tokens.css';
import './app.css';
import App from './App.jsx';

createRoot(document.getElementById('root')).render(<App />);
