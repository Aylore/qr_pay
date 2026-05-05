import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import BillPage from './pages/BillPage'
import SplitPage from './pages/SplitPage'
import PayPage from './pages/PayPage'
import ConfirmPage from './pages/ConfirmPage'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/t/:tableId" element={<BillPage />} />
        <Route path="/t/:tableId/split" element={<SplitPage />} />
        <Route path="/t/:tableId/pay" element={<PayPage />} />
        <Route path="/t/:tableId/confirm" element={<ConfirmPage />} />
        <Route path="*" element={
          <div style={{display:'flex',alignItems:'center',justifyContent:'center',minHeight:'100vh',flexDirection:'column',gap:'1rem',padding:'2rem',textAlign:'center'}}>
            <div style={{fontSize:'48px'}}>🍽️</div>
            <p style={{color:'#666',fontSize:'16px'}}>Scan the QR code on your table to view your bill.</p>
          </div>
        }/>
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
)
