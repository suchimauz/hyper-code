import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import AuthPage from './AuthPage';

// Separate public sign-in bundle: never mounts the authenticated shell or its APIs.
createRoot(document.getElementById('root')!).render(<StrictMode><AuthPage /></StrictMode>);
