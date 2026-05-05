import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { bills, restaurant } from '../api'

const STATUS_COLOR = { open: '#1565c0', partial: '#e65100', settled: '#2e7d32', cancelled: '#757575' }
const STATUS_BG = { open: '#e3f2fd', partial: '#fff3e0', settled: '#e8f5e9', cancelled: '#f5f5f5' }
const STATUS_LABEL = { open: 'مفتوحة', partial: 'جزئي', settled: 'مسدّدة', cancelled: 'ملغاة' }
const PAYMENT_STATUS_LABEL = { completed: '✅ مكتمل', failed: '❌ فشل', pending: '⏳ معلّق', processing: '🔄 جاري' }

const s = {
  page: { minHeight: '100vh', background: '#f4f6f9', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' },
  nav: { background: '#1b5e20', color: 'white', padding: '1rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  navLeft: { display: 'flex', alignItems: 'center', gap: 12 },
  backBtn: { background: 'none', border: 'none', color: 'white', fontSize: 22, cursor: 'pointer' },
  navTitle: { fontSize: 17, fontWeight: 600 },
  qrNavBtn: { background: 'rgba(255,255,255,0.15)', border: 'none', color: 'white', padding: '7px 14px', borderRadius: 20, cursor: 'pointer', fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 },
  body: { padding: '1.25rem', maxWidth: 600, margin: '0 auto' },
  card: { background: 'white', borderRadius: 16, padding: '1.25rem', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginBottom: '1rem' },
  row: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.4rem 0', fontSize: 14, color: '#555' },
  totalRow: { display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', fontSize: 18, fontWeight: 700, color: '#1a1a2e' },
  divider: { border: 'none', borderTop: '0.5px solid #f0f0f0', margin: '0.75rem 0' },
  sectionTitle: { fontSize: 13, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: '0.75rem' },
  badge: (status) => ({ display: 'inline-block', fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 20, background: STATUS_BG[status], color: STATUS_COLOR[status] }),
  itemRow: { display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', fontSize: 14 },
  paymentRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 0', fontSize: 14 },
  cancelBtn: { width: '100%', padding: '13px', background: 'transparent', color: '#c62828', border: '1.5px solid #ef9a9a', borderRadius: 12, fontSize: 15, cursor: 'pointer', fontWeight: 500 },
  // QR Modal
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: '1rem' },
  modal: { background: 'white', borderRadius: 20, padding: '2rem', maxWidth: 340, width: '100%', textAlign: 'center' },
  modalTitle: { fontSize: 17, fontWeight: 700, marginBottom: 4 },
  modalSubtitle: { fontSize: 13, color: '#888', marginBottom: '1.5rem' },
  qrImg: { width: '100%', maxWidth: 240, borderRadius: 12, border: '1px solid #e0e0e0', margin: '0 auto', display: 'block' },
  qrUrl: { fontSize: 11, color: '#aaa', wordBreak: 'break-all', marginTop: '1rem', background: '#f5f5f5', padding: '8px', borderRadius: 8 },
  closeBtn: { marginTop: '1.5rem', width: '100%', padding: '12px', background: '#1b5e20', color: 'white', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 600, cursor: 'pointer' },
  copyBtn: { marginTop: 8, width: '100%', padding: '10px', background: 'transparent', color: '#1b5e20', border: '1.5px solid #1b5e20', borderRadius: 12, fontSize: 14, cursor: 'pointer' },
}

export default function BillDetailPage() {
  const { billId } = useParams()
  const navigate = useNavigate()
  const [bill, setBill] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showQR, setShowQR] = useState(false)
  const [qrData, setQrData] = useState(null)
  const [qrLoading, setQrLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    bills.get(billId).then(setBill).catch(() => navigate('/')).finally(() => setLoading(false))
  }, [billId])

  const handleShowQR = async () => {
    if (qrData) { setShowQR(true); return }
    setQrLoading(true)
    try {
      const data = await restaurant.tableQR(bill.table_id)
      setQrData(data)
      setShowQR(true)
    } catch (e) {
      alert('Could not load QR: ' + e.message)
    } finally {
      setQrLoading(false)
    }
  }

  const handleCopyUrl = () => {
    if (!qrData) return
    navigator.clipboard.writeText(qrData.url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading) return <div style={{ textAlign: 'center', padding: '4rem', color: '#888' }}>جارٍ التحميل...</div>
  if (!bill) return null

  const currency = bill.currency || 'EGP'
  const canCancel = bill.status === 'open'

  const handleCancel = async () => {
    if (!confirm('هل تريد إلغاء هذه الفاتورة؟')) return
    await bills.cancel(billId)
    navigate('/')
  }

  return (
    <div style={s.page}>
      <div style={s.nav}>
        <div style={s.navLeft}>
          <button style={s.backBtn} onClick={() => navigate('/')}>←</button>
          <div style={s.navTitle}>تفاصيل الفاتورة</div>
        </div>
        <button style={s.qrNavBtn} onClick={handleShowQR} disabled={qrLoading}>
          {qrLoading ? '...' : '📱 QR الطاولة'}
        </button>
      </div>

      <div style={s.body}>
        {/* Summary */}
        <div style={s.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <span style={s.badge(bill.status)}>{STATUS_LABEL[bill.status]}</span>
            {bill.foodics_order_id && <span style={{ fontSize: 12, color: '#bbb' }}>#{bill.foodics_order_id}</span>}
          </div>
          <div style={s.row}><span>المجموع الجزئي</span><span>{Number(bill.subtotal).toFixed(2)} {currency}</span></div>
          {Number(bill.tax) > 0 && <div style={s.row}><span>الضريبة</span><span>{Number(bill.tax).toFixed(2)} {currency}</span></div>}
          <div style={s.totalRow}><span>الإجمالي</span><span>{Number(bill.total).toFixed(2)} {currency}</span></div>
          <hr style={s.divider} />
          <div style={{ ...s.row, color: '#2e7d32' }}><span>تم الدفع</span><span>{Number(bill.amount_paid).toFixed(2)} {currency}</span></div>
          <div style={{ ...s.row, color: '#e65100', fontWeight: 600 }}><span>المتبقي</span><span>{Number(bill.amount_remaining).toFixed(2)} {currency}</span></div>
        </div>

        {/* Items */}
        <div style={s.card}>
          <div style={s.sectionTitle}>الأصناف</div>
          {bill.items.map((item, i) => (
            <div key={i} style={{ ...s.itemRow, borderBottom: i < bill.items.length - 1 ? '0.5px solid #f5f5f5' : 'none' }}>
              <span>{item.name_ar || item.name} × {item.quantity}</span>
              <span style={{ fontWeight: 500 }}>{Number(item.total_price).toFixed(2)} {currency}</span>
            </div>
          ))}
        </div>

        {/* Payments */}
        {bill.payment_intents?.length > 0 && (
          <div style={s.card}>
            <div style={s.sectionTitle}>المدفوعات</div>
            {bill.payment_intents.map((p, i) => (
              <div key={i} style={{ ...s.paymentRow, borderBottom: i < bill.payment_intents.length - 1 ? '0.5px solid #f5f5f5' : 'none' }}>
                <div>
                  <div style={{ fontWeight: 500 }}>{p.payer_name || 'ضيف'}</div>
                  <div style={{ fontSize: 11, color: '#bbb', marginTop: 2 }}>{p.payment_method?.replace('_', ' ')}</div>
                </div>
                <div style={{ textAlign: 'end' }}>
                  <div>{Number(p.amount).toFixed(2)} {currency}</div>
                  <div style={{ fontSize: 12, color: '#888' }}>{PAYMENT_STATUS_LABEL[p.status]}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {canCancel && (
          <button style={s.cancelBtn} onClick={handleCancel}>إلغاء الفاتورة</button>
        )}
      </div>

      {/* QR Modal */}
      {showQR && qrData && (
        <div style={s.overlay} onClick={() => setShowQR(false)}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <div style={s.modalTitle}>📱 QR الطاولة</div>
            <div style={s.modalSubtitle}>طاولة رقم {qrData.table_number} — امسح للدفع</div>
            <img
              style={s.qrImg}
              src={`data:image/png;base64,${qrData.qr_png_base64}`}
              alt="QR Code"
            />
            <div style={s.qrUrl}>{qrData.url}</div>
            <button style={s.copyBtn} onClick={handleCopyUrl}>
              {copied ? '✅ تم النسخ' : '📋 نسخ الرابط'}
            </button>
            <button style={s.closeBtn} onClick={() => setShowQR(false)}>إغلاق</button>
          </div>
        </div>
      )}
    </div>
  )
}
