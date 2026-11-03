import './globalShim.js';
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import KitchenDashboard from './KitchenDashboard.jsx'
import OwnerDashboard from './OwnerDashboard.jsx'

const path = window.location.pathname;
const isKitchenView = path.startsWith('/kitchen');
const isOwnerView = path.startsWith('/owner');

function Root() {
  if (isOwnerView) return <OwnerDashboard />;
  if (isKitchenView) return <KitchenDashboard />;
  return <App />;
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)