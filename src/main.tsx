import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { GameApp } from './ui/GameApp.tsx';
import './ui/style.css';
import './ui/game.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GameApp />
  </StrictMode>,
);
