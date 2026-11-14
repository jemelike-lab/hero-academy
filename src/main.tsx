import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import App from './App';
import './index.css';
import { installAudioUnlock } from './lib/tts';

// Prime Humphrey's audio on the first tap anywhere (iPad Safari autoplay rule).
installAudioUnlock();

// VITE_PREVIEW=1 builds a single-file preview (hash routing) for hosted review.
const Router = import.meta.env.VITE_PREVIEW ? HashRouter : BrowserRouter;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Router>
      <App />
    </Router>
  </React.StrictMode>,
);
