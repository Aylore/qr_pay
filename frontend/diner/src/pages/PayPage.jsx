import { useState } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { initiatePayment } from '../api'

const METHODS = [
  { id: 'card', label: 'بطاقة بنكية', labelEn: 'Card', icon: '💳', desc: 'Visa / Mastercard / Meeza' },
  { id: 'vodafone_cash', label: 'فودافون كاش', labelEn: 'Vodafone Cash', icon: '📱', desc: 'رقم هاتفك' },
  { id: 'instapay', label: 'انستاباي', labelEn: 'InstaPay', icon: '⚡', desc: 'تحويل فوري' },
]

const s = {
  container: { maxWidth: 480, margin: '0 auto', padding: '1rem', minHeight: '100vh' },
  back: { background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', marginBottom: '1rem', display: 'block' },
  title: { fontSize: 22, fontWeight: 700, marginBottom: 4 },
  amountBox: { background: 'white', borderRadius: 16, padding: '1.25rem', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  amountLabel: { fontSize: 14, color: '#888' },
  amountValue: { fontSize: 26, fontWeight: 700, color: '#1a1a2e' },
  currency: { fontSize: 14, color: '#888', marginInlineStart: 4 },
  sectionTitle: { fontSize: 13, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: '0.75rem' },
  method: (selected) => ({
    display: 'flex', alignItems: 'center', gap: 12, padding: '1rem', borderRadius: 14,
    border: `1.5px solid ${selected ? '#1b5e20' : '#e0e0e0'}`,
    background: selected ? '#f1f8f1' : 'white', cursor: 'pointer', marginBottom: 10,
    transition: 'all 0.15s',
  }),
  methodIcon: { fontSize: 26, minWidth: 32, textAlign: 'center' },
  methodText: { flex: 1 },
  methodLabel: { fontSize: 16, fontWeight: 600 },
  methodDesc: { fontSize: 12, color: '#888', marginTop: 2 },
  check: (selected) => ({
    width: 22, height: 22, borderRadius: '50%',
    background: selected ? '#1b5e20' : 'transparent',
    border: `2px solid ${selected ? '#1b5e20' : '#ccc'}`,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: 'white', fontSize: 12, flexShrink: 0,
  }),
  input: { width: '100%', padding: '12px 14px', border: '1.5px solid #e0e0e0', borderRadius: 10, fontSize: 16, outline: 'none', marginBottom: 10 },
  btn: (disabled) => ({
    width: '100%', padding: '15px', background: disabled ? '#bdbdbd' : '#1b5e20',
    color: 'white', border: 'none', borderRadius: 14, fontSize: 16, fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer', marginTop: 8,
  }),
  error: { background: '#ffebee', color: '#c62828', borderRadius: 10, padding: '10px 12px', fontSize: 14, marginBottom: 10 },
  card: { background: 'white', borderRadius: 16, padding: '1.25rem', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', marginBottom: '1rem' },
}

export default function PayPage() {
  const { tableId } = useParams()
  const navigate = useNavigate()
  const { state } = useLocation()
  const bill = state?.bill
  const amount = state?.amount
  const itemsPaid = state?.itemsPaid || null

  const [selectedMethod, setSelectedMethod] = useState(null)
  const [payerName, setPayerName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  if (!bill || !amount) {
    navigate(`/t/${tableId}`)
    return null
  }

  const currency = bill.currency || 'EGP'

  const handlePay = async () => {
    if (!selectedMethod) return
    setLoading(true)
    setError(null)
    try {
      const result = await initiatePayment({
        billId: bill.id,
        amount,
        paymentMethod: selectedMethod,
        payerName: payerName || null,
        itemsPaid,
      })
      // Step 12 — redirect to gateway checkout
      window.location.href = result.checkout_url
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={s.container}>
      <button style={s.back} onClick={() => navigate(-1)}>←</button>
      <div style={s.title}>اختر طريقة الدفع</div>

      <div style={s.amountBox}>
        <span style={s.amountLabel}>المبلغ</span>
        <div>
          <span style={s.amountValue}>{Number(amount).toFixed(2)}</span>
          <span style={s.currency}>{currency}</span>
        </div>
      </div>

      {error && <div style={s.error}>⚠️ {error}</div>}

      <div style={s.sectionTitle}>طريقة الدفع</div>
      {METHODS.map(m => (
        <div key={m.id} style={s.method(selectedMethod === m.id)} onClick={() => setSelectedMethod(m.id)}>
          <span style={s.methodIcon}>{m.icon}</span>
          <div style={s.methodText}>
            <div style={s.methodLabel}>{m.label}</div>
            <div style={s.methodDesc}>{m.desc}</div>
          </div>
          <div style={s.check(selectedMethod === m.id)}>
            {selectedMethod === m.id && '✓'}
          </div>
        </div>
      ))}

      <div style={s.card}>
        <div style={{ fontSize: 14, color: '#666', marginBottom: 8 }}>
          اسمك (اختياري — لتسهيل التقسيم)
        </div>
        <input
          style={s.input}
          type="text"
          placeholder="مثال: أحمد"
          value={payerName}
          onChange={e => setPayerName(e.target.value)}
        />
      </div>

      <button
        style={s.btn(!selectedMethod || loading)}
        onClick={handlePay}
        disabled={!selectedMethod || loading}
      >
        {loading ? 'جارٍ التحويل...' : `ادفع ${Number(amount).toFixed(2)} ${currency}`}
      </button>
    </div>
  )
}
