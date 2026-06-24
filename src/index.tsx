import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import './grid-pattern.css'; // Import grid pattern CSS
import App from './App';
import reportWebVitals from './reportWebVitals';
import { initializeUsers } from './data/initialUsers';

// Initialize sample users for testing - DISABLED
// initializeUsers();

// Force dark mode for Tailwind
if (!document.documentElement.classList.contains('dark')) {
  document.documentElement.classList.add('dark');
}

// Block browser back navigation to auth pages for authenticated users
window.addEventListener('DOMContentLoaded', () => {
  const handleBackButton = () => {
    const path = window.location.pathname;
    const isAuthPage = path === '/signin' || path === '/signup';
    // Use simpler session storage auth flag
    const isAuthenticated = sessionStorage.getItem('isAuthenticated') === 'true';
    if (isAuthPage && isAuthenticated) {
      window.history.forward();
    }
  };
  window.addEventListener('popstate', handleBackButton);
});

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
