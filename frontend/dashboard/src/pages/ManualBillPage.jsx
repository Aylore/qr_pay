import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { bills } from '../api'

const newItem = () => ({ name: '', name_ar: '', quantity: 1, unit_price: '', total_price: '' })

const s = {
  page: { minHeight: '100vh', background: '#f4f6f9', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' },
  nav: { background: '#1b5e20', color: 'white', padding: '1rem 1.5rem', display: 'flex', alignItems: 'center', gap: 12 },
  backBtn: { background: 'none', border: 'none', color: 'white', fontSize: 22, cursor: 'pointer' },
  navTitle: { fontSize: 17, fontWeight: 600 },
  body: { padding: '1.25rem', maxWidth: 600, margin: '0 auto' },
  card: { background: 'white', borderRadius: 16, padding: '1.25rem', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginBottom: '1rem' },
  sectionTitle: { fontSize: 13, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: '1rem' },
  itemCard: { border: '0.5px solid #e0e0e0', borderRadius: 12, padding: '1rem', marginBottom: '0.75rem' },
  row2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 },
  row3: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 8 },
  label: { fontSize: 12, color: '#888', marginBottom: 4, display: 'block' },
  input: { width: '100%', padding: '10px 12px', border: '1.5px solid #e0e0e0', borderRadius: 8, fontSize: 14, outline: 'none', boxSizing: 'border-box' },
  removeBtn: { background: 'none', border: 'none', color: '#e53935', cursor: 'pointer', fontSize: 18, padding: '4px' },
  addItemBtn: { width: '100%', padding: '12px', background: 'transparent', border: '1.5px dashed #bbb', borderRadius: 12, color: '#888', cursor: 'pointer', fontSize: 14 },
  totalBox: { display: 'flex', justifyContent: 'space-between', fontSize: 18, fontWeight: 700, padding: '0.75rem 0' },
  submitBtn: (loading) => ({ width: '100%', padding: '15px', background: loading ? '#81c784' : '#1b5e20', color: 'white', border: 'none', borderRadius: 14, fontSize: 16, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer' }),
  error: { background: '#ffebee', color: '#c62828', borderRadius: 10, padding: '10px 12px', fontSize: 14, marginBottom: '1rem' },
}

export default function ManualBillPage() {
  const { tableId } = useParams()
  const navigate = useNavigate()
  const [items, setItems] = useState([newItem()])
  const [tax, setTax] = useState('0')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const updateItem = (i, key, val) => {
    setItems(prev => {
      const next = [...prev]
      next[i] = { ...next[i], [key]: val }
      if (key === 'quantity' || key === 'unit_price') {
        const qty = parseFloat(key === 'quantity' ? val : next[i].quantity) || 0
        const price = parseFloat(key === 'unit_price' ? val : next[i].unit_price) || 0
        next[i].total_price = (qty * price).toFixed(2)
      }
      return next
    })
  }

  const subtotal = items.reduce((sum, i) => sum + (parseFloat(i.total_price) || 0), 0)
  const taxAmount = parseFloat(tax) || 0
  const total = subtotal + taxAmount

  const handleSubmit = async () => {
    const validItems = items.filter(i => i.name && parseFloat(i.total_price) > 0)
    if (validItems.length === 0) {
      setError('أضف صنفاً واحداً على الأقل بسعر')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const bill = await bills.create({
        table_id: tableId,
        items: validItems.map(i => ({
          name: i.name,
          name_ar: i.name_ar || i.name,
          quantity: parseInt(i.quantity) || 1,
          unit_price: parseFloat(i.unit_price) || parseFloat(i.total_price),
          total_price: parseFloat(i.total_price),
        })),
        tax: taxAmount,
        currency: 'EGP',
      })
      navigate(`/bills/${bill.id}`)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={s.page}>
      <div style={s.nav}>
        <button style={s.backBtn} onClick={() => navigate('/')}>←</button>
        <div style={s.navTitle}>إدخال فاتورة يدوي</div>
      </div>

      <div style={s.body}>
        {error && <div style={s.error}>⚠️ {error}</div>}

        <div style={s.card}>
          <div style={s.sectionTitle}>الأصناف</div>

          {items.map((item, i) => (
            <div key={i} style={s.itemCard}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: '#888' }}>صنف {i + 1}</span>
                {items.length > 1 && (
                  <button style={s.removeBtn} onClick={() => setItems(prev => prev.filter((_, j) => j !== i))}>×</button>
                )}
              </div>
              <div style={s.row2}>
                <div>
                  <label style={s.label}>الاسم</label>
                  <input style={s.input} placeholder="Grilled Chicken" value={item.name} onChange={e => updateItem(i, 'name', e.target.value)} />
                </div>
                <div>
                  <label style={s.label}>الاسم بالعربي</label>
                  <input style={s.input} placeholder="دجاج مشوي" value={item.name_ar} onChange={e => updateItem(i, 'name_ar', e.target.value)} />
                </div>
              </div>
              <div style={s.row3}>
                <div>
                  <label style={s.label}>الكمية</label>
                  <input style={s.input} type="number" min="1" value={item.quantity} onChange={e => updateItem(i, 'quantity', e.target.value)} />
                </div>
                <div>
                  <label style={s.label}>سعر الوحدة</label>
                  <input style={s.input} type="number" placeholder="0.00" value={item.unit_price} onChange={e => updateItem(i, 'unit_price', e.target.value)} />
                </div>
                <div>
                  <label style={s.label}>الإجمالي</label>
                  <input style={{ ...s.input, background: '#f9f9f9', color: '#1b5e20', fontWeight: 600 }} value={item.total_price} readOnly />
                </div>
              </div>
            </div>
          ))}

          <button style={s.addItemBtn} onClick={() => setItems(prev => [...prev, newItem()])}>
            + إضافة صنف
          </button>
        </div>

        <div style={s.card}>
          <div style={s.sectionTitle}>الإجماليات</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, color: '#555', marginBottom: 12 }}>
            <span>المجموع الجزئي</span>
            <span>{subtotal.toFixed(2)} EGP</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <label style={{ fontSize: 14, color: '#555' }}>الضريبة</label>
            <input style={{ ...s.input, width: 120, textAlign: 'end' }} type="number" placeholder="0.00" value={tax} onChange={e => setTax(e.target.value)} />
          </div>
          <div style={s.totalBox}>
            <span>الإجمالي</span>
            <span>{total.toFixed(2)} EGP</span>
          </div>
        </div>

        <button style={s.submitBtn(loading)} onClick={handleSubmit} disabled={loading}>
          {loading ? 'جارٍ الحفظ...' : 'حفظ وتفعيل الفاتورة'}
        </button>
      </div>
    </div>
  )
}
