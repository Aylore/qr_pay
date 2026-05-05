import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import LoginPage from './pages/LoginPage'
import TablesPage from './pages/TablesPage'
import BillDetailPage from './pages/BillDetailPage'
import ManualBillPage from './pages/ManualBillPage'
import SettingsPage from './pages/SettingsPage'

function PrivateRoute({ children }) {
  return localStorage.getItem('qrpay_token') ? children : <Navigate to="/login" replace />
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<PrivateRoute><TablesPage /></PrivateRoute>} />
        <Route path="/settings" element={<PrivateRoute><SettingsPage /></PrivateRoute>} />
        <Route path="/bills/:billId" element={<PrivateRoute><BillDetailPage /></PrivateRoute>} />
        <Route path="/bills/new/:tableId" element={<PrivateRoute><ManualBillPage /></PrivateRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
)
