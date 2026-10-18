import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { UpdateBanner } from './ui/UpdateBanner.tsx'
import { StoreProvider } from './state/store.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreProvider>
      <App />
      <UpdateBanner />
    </StoreProvider>
  </StrictMode>,
)
