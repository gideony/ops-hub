import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './style.css'
import './theme-tokens.css'
import './reference-layout.css'
import './dark-theme.css'
import './user-settings.css'
import './user-editor.css'
import './reports.css'
import './client-registration.css'
import './chat.css'

document.documentElement.dataset.theme = (localStorage.getItem('opshub-theme')) === 'light' ? 'light' : 'dark'

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>)
