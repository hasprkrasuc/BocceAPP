import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { osveziObStariObjavi } from './components/ErrorBoundary'
import './index.css'

// Vite sproži ta dogodek, ko prednalaganja svežnja ne uspe -- torej ob prvem
// znaku, da je zavihek starejši od zadnje objave. Ujamemo ga tu, ker je to
// hitrejše od čakanja, da uvoz zavrne obljubo in React vrže napako.
window.addEventListener('vite:preloadError', event => {
  if (osveziObStariObjavi(event.payload)) event.preventDefault()
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
