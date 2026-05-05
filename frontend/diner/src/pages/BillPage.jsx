import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { fetchBill } from '../api'

const styles = {
  container: { maxWidth: 480, margin: '0 auto', padding: '1rem', minHeight: '100vh' },
  header: { background: '#1b5e20', color: 'white', borderRadius: '0 0 20px 20px',
            padding: '1.5rem 1.25rem', marginBottom: '1rem', marginInline: '-1rem', marginTop: 0 },
  logo: { fontSize: 13, opacity: 0.8, marginBottom: 4 },
  restaurantName: { fontSize: 20, fontWeight: 600 },
  tableTag: { display: 'inline-block', background: 'rgba(255,255,255,0.2)',
              borderRadius: 20, padding: '2px 10px', fontSize: 13, marginTop: 4 },
  card: { background: 'white', borderRadius: 16, padding: '1.25rem',
          boxShadow: '0 2px 12px rgba(0,0,0,0.06)', marginBottom: '1rem' },
  sectionTitle: { fontSize: 13, fontWeight: 600, color: '#888',
                  textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: '0.75rem' },
  item: { display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '0.5rem 0', borderBottom: '0.5px solid #f0f0f0' },
  itemName: { fontSize: 15, color: '#1a1a2e' },
  itemQty: { fontSize: 12, color: '#999', marginTop: 2 },
  itemPrice: { fontSize: 15, fontWeight: 500, color: '#1a1a2e', whiteSpace: 'nowrap', marginInlineStart: 8 },
  divider: { border: 'none', borderTop: '0.5px solid #f0f0f0', margin: '0.75rem 0' },
  row: { display: 'flex', justifyContent: 'space-between', padding: '0.25rem 0', fontSize: 14, color: '#555' },
  totalRow: { display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0',
              fontSize: 18, fontWeight: 700, color: '#1a1a2e' },
  paidBadge: { background: '#e8f5e9', color: '#2e7d32', borderRadius: 8, padding: '6px 12px',
               fontSize: 13, fontWeight: 500, marginBottom: '0.75rem', textAlign: 'center' },
  btn: { width: '100%', padding: '15px', background: '#1b5e20', color: 'white',
         border: 'none', borderRadius: 14, fontSize: 16, fontWeight: 600,
         cursor: 'pointer', marginBottom: 10 },
  btnSecondary: { width: '100%', padding: '13px', background: 'transparent', color: '#1b5e20',
                  border: '1.5px solid #1b5e20', borderRadius: 14, fontSize: 15,
                  fontWeight: 500, cursor: 'pointer' },
  error: { textAlign: 'center', padding: '3rem 1rem', color: '#c62828' },
  loading: { textAlign: 'center', padding: '4rem 1rem', color: '#888' },
}

export default function BillPage() {
  const { tableId } = useParams()
  const navigate = useNavigate()
  const [bill, setBill] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchBill(tableId)
      .then(setBill)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [tableId])

  if (loading) return <div style={styles.loading}>⏳ جارٍ تحميل الفاتورة...</div>
  if (error) return <div style={styles.error}>❌ {error}</div>

  const isSettled = bill.status === 'settled'
  const currency = bill.currency || 'EGP'

  const handlePayAll = () => {
    navigate(`/t/${tableId}/pay`, { state: { bill, amount: bill.amount_remaining, splitType: 'full' } })
  }
  const handleSplit = () => {
    navigate(`/t/${tableId}/split`, { state: { bill } })
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.logo}>🍽️ QR Pay</div>
        <div style={styles.restaurantName}>فاتورتك</div>
        <div style={styles.tableTag}>طاولة رقم {bill.table_id?.slice(-4)}</div>
      </div>

      {/* Items */}
      <div style={styles.card}>
        <div style={styles.sectionTitle}>تفاصيل الطلب</div>
        {bill.items.map((item, i) => {
          const paidEntry = (bill.paid_items || []).find(p => p.item_index === i)
          const qtyPaid = paidEntry?.qty_paid || 0
          const qtyRemaining = item.quantity - qtyPaid
          const unitPrice = Number(item.total_price) / Number(item.quantity)
          const isFullyPaid = qtyPaid >= item.quantity
          const isPartiallyPaid = qtyPaid > 0 && !isFullyPaid

          return (
            <div key={i} style={{
              ...styles.item,
              borderBottom: i < bill.items.length - 1 ? '0.5px solid #f0f0f0' : 'none',
              opacity: isFullyPaid ? 0.5 : 1,
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ ...styles.itemName, textDecoration: isFullyPaid ? 'line-through' : 'none' }}>
                    {item.name_ar || item.name}
                  </span>
                  {isFullyPaid && (
                    <span style={{ fontSize: 11, background: '#e8f5e9', color: '#2e7d32', borderRadius: 20, padding: '1px 7px', fontWeight: 600 }}>
                      ✓ مدفوع
                    </span>
                  )}
                  {isPartiallyPaid && (
                    <span style={{ fontSize: 11, background: '#fff3e0', color: '#e65100', borderRadius: 20, padding: '1px 7px', fontWeight: 600 }}>
                      {qtyPaid}/{item.quantity} مدفوع
                    </span>
                  )}
                </div>
                <div style={styles.itemQty}>
                  {isFullyPaid
                    ? `× ${item.quantity} — مسدّد`
                    : isPartiallyPaid
                    ? `× ${qtyRemaining} متبقي (${qtyPaid} مدفوع)`
                    : `× ${item.quantity}`
                  }
                </div>
              </div>
              <div style={{ textAlign: 'end' }}>
                {isPartiallyPaid && (
                  <div style={{ fontSize: 12, color: '#aaa', textDecoration: 'line-through' }}>
                    {Number(item.total_price).toFixed(2)}
                  </div>
                )}
                <div style={{ ...styles.itemPrice, color: isFullyPaid ? '#aaa' : '#1a1a2e' }}>
                  {isFullyPaid
                    ? Number(item.total_price).toFixed(2)
                    : (unitPrice * qtyRemaining).toFixed(2)
                  } {currency}
                </div>
              </div>
            </div>
          )
        })}

        <hr style={styles.divider} />

        <div style={styles.row}>
          <span>المجموع الجزئي</span>
          <span>{Number(bill.subtotal).toFixed(2)} {currency}</span>
        </div>
        {Number(bill.tax) > 0 && (
          <div style={styles.row}>
            <span>الضريبة</span>
            <span>{Number(bill.tax).toFixed(2)} {currency}</span>
          </div>
        )}
        <div style={styles.totalRow}>
          <span>الإجمالي</span>
          <span>{Number(bill.total).toFixed(2)} {currency}</span>
        </div>

        {Number(bill.amount_paid) > 0 && (
          <>
            <div style={{ ...styles.row, color: '#2e7d32' }}>
              <span>تم الدفع</span>
              <span>- {Number(bill.amount_paid).toFixed(2)} {currency}</span>
            </div>
            <div style={{ ...styles.totalRow, color: '#c62828' }}>
              <span>المتبقي</span>
              <span>{Number(bill.amount_remaining).toFixed(2)} {currency}</span>
            </div>
          </>
        )}
      </div>

      {/* Payment history */}
      {bill.payment_intents?.filter(p => p.status === 'completed').length > 0 && (
        <div style={styles.card}>
          <div style={styles.sectionTitle}>المدفوعات</div>
          {bill.payment_intents.filter(p => p.status === 'completed').map((p, i) => (
            <div key={i} style={styles.row}>
              <span>{p.payer_name || 'شخص'}</span>
              <span style={{ color: '#2e7d32', fontWeight: 500 }}>
                {Number(p.amount).toFixed(2)} {currency} ✓
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      {!isSettled ? (
        <div style={styles.card}>
          <button style={styles.btn} onClick={handlePayAll}>
            ادفع الكل — {Number(bill.amount_remaining).toFixed(2)} {currency}
          </button>
          <button style={styles.btnSecondary} onClick={handleSplit}>
            تقسيم الفاتورة
          </button>
        </div>
      ) : (
        <div style={{ ...styles.card, textAlign: 'center' }}>
          <div style={styles.paidBadge}>✅ تم دفع الفاتورة بالكامل</div>
          <p style={{ fontSize: 14, color: '#888' }}>شكراً لك! نراك قريباً</p>
        </div>
      )}
    </div>
  )
}
