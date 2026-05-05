import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { restaurant, bills, webhooks } from '../api'
import { useWebSocket } from '../hooks/useWebSocket'

const STATUS_COLOR = {
  open: '#1565c0', partial: '#e65100', settled: '#2e7d32', cancelled: '#757575',
}
const STATUS_BG = {
  open: '#e3f2fd', partial: '#fff3e0', settled: '#e8f5e9', cancelled: '#f5f5f5',
}
const STATUS_LABEL = {
  open: 'مفتوحة', partial: 'جزئي', settled: 'مسدّدة', cancelled: 'ملغاة',
}

const s = {
  page: { minHeight: '100vh', background: '#f4f6f9', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' },
  nav: { background: '#1b5e20', color: 'white', padding: '1rem 1.5rem',
         display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  navTitle: { fontSize: 18, fontWeight: 700 },
  navMeta: { fontSize: 13, opacity: 0.8 },
  logoutBtn: { background: 'rgba(255,255,255,0.15)', border: 'none', color: 'white',
               padding: '6px 14px', borderRadius: 20, cursor: 'pointer', fontSize: 13 },
  body: { padding: '1.5rem' },
  sectionHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' },
  sectionTitle: { fontSize: 16, fontWeight: 600, color: '#1a1a2e' },
  addBtn: { background: '#1b5e20', color: 'white', border: 'none', borderRadius: 10,
            padding: '8px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 500 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginBottom: '2rem' },
  tableCard: (status) => ({
    background: 'white', borderRadius: 16, padding: '1.25rem',
    boxShadow: '0 2px 8px rgba(0,0,0,0.06)', cursor: 'pointer',
    border: `2px solid ${STATUS_COLOR[status] || '#e0e0e0'}`,
    transition: 'transform 0.1s',
  }),
  tableNum: { fontSize: 22, fontWeight: 700, color: '#1a1a2e', marginBottom: 4 },
  tableLabel: { fontSize: 12, color: '#888', marginBottom: 8 },
  statusBadge: (status) => ({
    display: 'inline-block', fontSize: 11, fontWeight: 600, padding: '3px 8px',
    borderRadius: 20, background: STATUS_BG[status], color: STATUS_COLOR[status],
  }),
  billAmount: { fontSize: 14, fontWeight: 600, color: '#1a1a2e', marginTop: 6 },
  billsSection: { marginTop: '2rem' },
  billRow: { background: 'white', borderRadius: 12, padding: '1rem 1.25rem',
             display: 'flex', justifyContent: 'space-between', alignItems: 'center',
             marginBottom: 8, cursor: 'pointer', boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
             border: '0.5px solid #f0f0f0' },
  simulateBtn: { background: '#e3f2fd', color: '#1565c0', border: 'none', borderRadius: 10,
                 padding: '8px 14px', cursor: 'pointer', fontSize: 12, fontWeight: 500 },
  wsIndicator: (connected) => ({
    width: 8, height: 8, borderRadius: '50%',
    background: connected ? '#4caf50' : '#f44336',
    display: 'inline-block', marginInlineEnd: 6,
  }),
  addTableModal: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
                   display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  modal: { background: 'white', borderRadius: 20, padding: '2rem', width: '90%', maxWidth: 380 },
  input: { width: '100%', padding: '12px 14px', border: '1.5px solid #e0e0e0',
           borderRadius: 10, fontSize: 15, outline: 'none', marginBottom: '1rem', boxSizing: 'border-box' },
  modalBtn: (primary) => ({
    flex: 1, padding: '12px', border: primary ? 'none' : '1px solid #e0e0e0',
    borderRadius: 10, background: primary ? '#1b5e20' : 'white',
    color: primary ? 'white' : '#666', cursor: 'pointer', fontSize: 14, fontWeight: 500,
  }),
}

export default function TablesPage() {
  const navigate = useNavigate()
  const [tables, setTables] = useState([])
  const [activeBills, setActiveBills] = useState({}) // tableId → bill
  const [wsConnected, setWsConnected] = useState(false)
  const [restaurantInfo, setRestaurantInfo] = useState(null)
  const [showAddTable, setShowAddTable] = useState(false)
  const [newTableNum, setNewTableNum] = useState('')
  const [newTableLabel, setNewTableLabel] = useState('')

  useEffect(() => {
    restaurant.me().then(setRestaurantInfo).catch(() => {})
    restaurant.tables().then(setTables).catch(() => {})
    bills.list().then(data => {
      const map = {}
      data.filter(b => b.status === 'open' || b.status === 'partial')
          .forEach(b => { map[b.table_id] = b })
      setActiveBills(map)
    }).catch(() => {})
  }, [])

  const onEvent = useCallback((event, data) => {
    if (event === 'bill_created') {
      setActiveBills(prev => ({ ...prev, [data.table_id]: data }))
    } else if (event === 'payment_update') {
      setActiveBills(prev => {
        const bill = Object.values(prev).find(b => b.id === data.bill_id)
        if (!bill) return prev
        return { ...prev, [bill.table_id]: { ...bill, ...data } }
      })
    } else if (event === 'bill_settled') {
      setActiveBills(prev => {
        const entry = Object.entries(prev).find(([, b]) => b.id === data.bill_id)
        if (!entry) return prev
        const [tableId] = entry
        const next = { ...prev }
        delete next[tableId]
        return next
      })
    }
  }, [])

  useWebSocket(onEvent, true)

  const handleAddTable = async () => {
    if (!newTableNum) return
    try {
      const t = await restaurant.createTable({ table_number: newTableNum, label: newTableLabel || undefined })
      setTables(prev => [...prev, t])
      setShowAddTable(false)
      setNewTableNum('')
      setNewTableLabel('')
    } catch (e) { alert(e.message) }
  }

  const handleSimulate = async (table) => {
    if (!restaurantInfo) return
    const restaurantId = restaurantInfo.id
    try {
      await webhooks.simulateFoodics({
        restaurant_id: restaurantId,
        order_id: `test-${Date.now()}`,
        table_number: table.table_number,
        items: [
          { name: 'Grilled Chicken', name_ar: 'دجاج مشوي', quantity: 2, unit_price: 85, total_price: 170 },
          { name: 'Fresh Juice', name_ar: 'عصير طازج', quantity: 3, unit_price: 35, total_price: 105 },
          { name: 'Caesar Salad', name_ar: 'سلطة سيزر', quantity: 1, unit_price: 65, total_price: 65 },
        ],
        subtotal: 340, tax: 51, total: 391, currency: 'EGP',
      })
    } catch (e) { alert(`Simulate failed: ${e.message}`) }
  }

  const logout = () => {
    localStorage.removeItem('qrpay_token')
    navigate('/login')
  }

  return (
    <div style={s.page}>
      <div style={s.nav}>
        <div>
          <div style={s.navTitle}>🍽️ {restaurantInfo?.name || 'QR Pay'}</div>
          <div style={s.navMeta}>
            <span style={s.wsIndicator(wsConnected)} />
            لوحة التحكم
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={s.logoutBtn} onClick={() => navigate('/settings')}>⚙️</button>
          <button style={s.logoutBtn} onClick={logout}>خروج</button>
        </div>
      </div>

      <div style={s.body}>
        {/* Tables grid */}
        <div style={s.sectionHeader}>
          <div style={s.sectionTitle}>الطاولات</div>
          <button style={s.addBtn} onClick={() => setShowAddTable(true)}>+ طاولة جديدة</button>
        </div>

        <div style={s.grid}>
          {tables.map(table => {
            const bill = activeBills[table.id]
            const status = bill?.status || 'idle'
            return (
              <div key={table.id} style={s.tableCard(bill ? bill.status : 'settled')}
                   onClick={() => bill ? navigate(`/bills/${bill.id}`) : navigate(`/bills/new/${table.id}`)}>
                <div style={s.tableNum}>#{table.table_number}</div>
                <div style={s.tableLabel}>{table.label || 'طاولة'}</div>
                {bill ? (
                  <>
                    <div style={s.statusBadge(bill.status)}>{STATUS_LABEL[bill.status]}</div>
                    <div style={s.billAmount}>
                      {Number(bill.amount_remaining || (bill.total - bill.amount_paid)).toFixed(2)} EGP
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ ...s.statusBadge('settled'), background: '#f5f5f5', color: '#bbb' }}>فارغة</div>
                    <div style={{ fontSize: 11, color: '#bbb', marginTop: 6 }}>اضغط لإدخال فاتورة</div>
                  </>
                )}
                {!bill && (
                  <button style={{ ...s.simulateBtn, marginTop: 8, fontSize: 11 }}
                          onClick={e => { e.stopPropagation(); handleSimulate(table) }}>
                    محاكاة Foodics
                  </button>
                )}
              </div>
            )
          })}
          {tables.length === 0 && (
            <div style={{ gridColumn: '1/-1', textAlign: 'center', color: '#bbb', padding: '2rem' }}>
              لا توجد طاولات بعد. أضف طاولتك الأولى.
            </div>
          )}
        </div>

        {/* Recent bills */}
        <div style={s.billsSection}>
          <div style={{ ...s.sectionHeader, marginBottom: '0.75rem' }}>
            <div style={s.sectionTitle}>الفواتير النشطة</div>
          </div>
          {Object.values(activeBills).length === 0 && (
            <div style={{ color: '#bbb', fontSize: 14, textAlign: 'center', padding: '1rem' }}>
              لا توجد فواتير نشطة حاليًا
            </div>
          )}
          {Object.values(activeBills).map(bill => (
            <div key={bill.id} style={s.billRow} onClick={() => navigate(`/bills/${bill.id}`)}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 15 }}>فاتورة طاولة</div>
                <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                  {new Date(bill.created_at).toLocaleTimeString('ar-EG')}
                </div>
              </div>
              <div style={{ textAlign: 'end' }}>
                <div style={s.statusBadge(bill.status)}>{STATUS_LABEL[bill.status]}</div>
                <div style={{ fontWeight: 600, marginTop: 4 }}>
                  {Number(bill.amount_remaining ?? bill.total).toFixed(2)} EGP
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Add table modal */}
      {showAddTable && (
        <div style={s.addTableModal} onClick={() => setShowAddTable(false)}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginBottom: '1.25rem', fontSize: 18 }}>إضافة طاولة جديدة</h3>
            <input style={s.input} placeholder="رقم الطاولة (مثال: 1)" value={newTableNum}
                   onChange={e => setNewTableNum(e.target.value)} />
            <input style={s.input} placeholder="اسم الطاولة (اختياري)" value={newTableLabel}
                   onChange={e => setNewTableLabel(e.target.value)} />
            <div style={{ display: 'flex', gap: 10 }}>
              <button style={s.modalBtn(false)} onClick={() => setShowAddTable(false)}>إلغاء</button>
              <button style={s.modalBtn(true)} onClick={handleAddTable}>إضافة</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
