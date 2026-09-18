import React from 'react'
import ReactDOM from 'react-dom/client'
import { ThemeProvider } from './theme/ThemeContext'
import { LanguageProvider } from './i18n'
import App from './App'

import './styles/design-tokens.css'
import './styles/components.css'
import './styles/prosemirror.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <LanguageProvider>
        <App />
      </LanguageProvider>
    </ThemeProvider>
  </React.StrictMode>
)
