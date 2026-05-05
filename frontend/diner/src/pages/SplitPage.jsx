import { useState, useMemo } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'

const s = {
  container: { maxWidth: 480, margin: '0 auto', padding: '1rem', minHeight: '100vh', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' },
  back: { background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', marginBottom: '1rem', display: 'block' },
  title: { fontSize: 22, fontWeight: 700, marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#888', marginBottom: '1.5rem' },
  card: { background: 'white', borderRadius: 16, padding: '1.25rem', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', marginBottom: '1rem' },
  tab: { display: 'flex', gap: 8, marginBottom: '1.25rem' },
  tabBtn: (active) => ({
    flex: 1, padding: '10px', border: `1.5px solid ${active ? '#1b5e20' : '#e0e0e0'}`,
    borderRadius: 10, background: active ? '#e8f5e9' : 'white',
    color: active ? '#1b5e20' : '#888', fontWeight: active ? 600 : 400,
    cursor: 'pointer', fontSize: 13, fontFamily: 'inherit',
  }),
  counter: { display: 'flex', alignItems: 'center', gap: 12 },
  counterBtn: { width: 32, height: 32, borderRadius: '50%', border: '1.5px solid #e0e0e0', background: 'white', fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  counterVal: { fontSize: 18, fontWeight: 600, minWidth: 24, textAlign: 'center' },
  input: { width: '100%', padding: '12px 14px', border: '1.5px solid #e0e0e0', borderRadius: 10, fontSize: 16, outline: 'none', marginBottom: 10 },
  btn: (disabled) => ({ width: '100%', padding: '15px', background: disabled ? '#ccc' : '#1b5e20', color: 'white', border: 'none', borderRadius: 14, fontSize: 16, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: 'inherit', marginTop: 8 }),
  shareBtn: { width: '100%', padding: '13px', background: '#25D366', color: 'white', border: 'none', borderRadius: 14, fontSize: 15, fontWeight: 500, cursor: 'pointer', marginTop: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: 'inherit' },
  divider: { border: 'none', borderTop: '0.5px solid #f0f0f0', margin: '0.75rem 0' },
  // Item styles
  itemRow: (selected, disabled) => ({
    display: 'flex', alignItems: 'flex-start', gap: 12, padding: '0.75rem',
    borderRadius: 12, marginBottom: 8, cursor: disabled ? 'default' : 'pointer',
    background: disabled ? '#fafafa' : selected ? '#f1f8f1' : '#fafafa',
    border: `1.5px solid ${disabled ? '#f0f0f0' : selected ? '#1b5e20' : '#f0f0f0'}`,
    opacity: disabled ? 0.5 : 1,
    transition: 'all 0.15s',
  }),
  checkbox: (selected, disabled) => ({
    width: 22, height: 22, borderRadius: 6, flexShrink: 0, marginTop: 1,
    border: `2px solid ${disabled ? '#ddd' : selected ? '#1b5e20' : '#ccc'}`,
    background: disabled ? '#e8f5e9' : selected ? '#1b5e20' : 'white',
    display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 13,
  }),
  itemInfo: { flex: 1 },
  itemName: { fontSize: 14, fontWeight: 500, color: '#1a1a2e' },
  itemMeta: { fontSize: 12, color: '#999', marginTop: 2 },
  paidBadge: { display: 'inline-block', fontSize: 10, fontWeight: 600, padding: '1px 7px', borderRadius: 20, background: '#e8f5e9', color: '#2e7d32', marginInlineStart: 6 },
  partialBadge: { display: 'inline-block', fontSize: 10, fontWeight: 600, padding: '1px 7px', borderRadius: 20, background: '#fff3e0', color: '#e65100', marginInlineStart: 6 },
  itemPrice: { fontSize: 14, fontWeight: 600, color: '#1b5e20', whiteSpace: 'nowrap' },
  qtyRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, paddingTop: 8, borderTop: '0.5px solid #e8f5e9' },
  qtyLabel: { fontSize: 12, color: '#666' },
  qtyBtns: { display: 'flex', alignItems: 'center', gap: 8 },
  qtyBtn: { width: 26, height: 26, borderRadius: '50%', border: '1px solid #ccc', background: 'white', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 },
  qtyVal: { fontSize: 14, fontWeight: 600, minWidth: 20, textAlign: 'center' },
  // Summary box
  summaryBox: { background: '#f8f9fa', borderRadius: 12, padding: '1rem', marginTop: 4 },
  summaryRow: { display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#666', marginBottom: 4 },
  summaryTotal: { display: 'flex', justifyContent: 'space-between', fontSize: 17, fontWeight: 700, color: '#1b5e20', marginTop: 6, paddingTop: 6, borderTop: '0.5px solid #e0e0e0' },
  hint: { fontSize: 12, color: '#aaa', textAlign: 'center', padding: '0.5rem' },
}

export default function SplitPage() {
  const { tableId } = useParams()
  const navigate = useNavigate()
  const { state } = useLocation()
  const bill = state?.bill

  const [mode, setMode] = useState('equal')
  const [people, setPeople] = useState(2)
  const [customAmount, setCustomAmount] = useState('')
  // {itemIndex: qtyChosen}
  const [selectedQty, setSelectedQty] = useState({})

  if (!bill) { navigate(`/t/${tableId}`); return null }

  const remaining = Number(bill.amount_remaining)
  const currency = bill.currency || 'EGP'
  const totalSubtotal = Number(bill.subtotal)
  const totalTax = Number(bill.tax)

  // Build a map of already-paid quantities per item
  const paidQtyMap = useMemo(() => {
    const map = {}
    ;(bill.paid_items || []).forEach(p => { map[p.item_index] = p.qty_paid })
    return map
  }, [bill.paid_items])

  // ── Item split helpers ──
  const toggleItem = (i) => {
    const availableQty = bill.items[i].quantity - (paidQtyMap[i] || 0)
    if (availableQty <= 0) return
    setSelectedQty(prev => {
      const next = { ...prev }
      if (next[i] !== undefined) delete next[i]
      else next[i] = availableQty  // default: take all remaining
      return next
    })
  }

  const setItemQty = (i, qty) => {
    const max = bill.items[i].quantity - (paidQtyMap[i] || 0)
    const clamped = Math.max(1, Math.min(max, qty))
    setSelectedQty(prev => ({ ...prev, [i]: clamped }))
  }

  // Compute item subtotal, proportional tax, and total for selected items
  const itemsSummary = useMemo(() => {
    let subtotal = 0
    Object.entries(selectedQty).forEach(([i, qty]) => {
      const item = bill.items[parseInt(i)]
      const unitPrice = Number(item.total_price) / Number(item.quantity)
      subtotal += unitPrice * qty
    })
    const taxShare = totalSubtotal > 0 ? totalTax * (subtotal / totalSubtotal) : 0
    return {
      subtotal: parseFloat(subtotal.toFixed(2)),
      taxShare: parseFloat(taxShare.toFixed(2)),
      total: parseFloat((subtotal + taxShare).toFixed(2)),
    }
  }, [selectedQty, totalSubtotal, totalTax, bill.items])

  // ── Navigation ──
  const handlePay = () => {
    let amount, itemsPaid = null
    if (mode === 'equal') {
      amount = parseFloat((remaining / people).toFixed(2))
    } else if (mode === 'custom') {
      amount = parseFloat(customAmount)
    } else {
      amount = itemsSummary.total
      itemsPaid = Object.entries(selectedQty).map(([i, qty]) => ({
        item_index: parseInt(i),
        quantity: qty,
      }))
    }
    navigate(`/t/${tableId}/pay`, { state: { bill, amount, splitType: mode, itemsPaid } })
  }

  const shareWhatsApp = () => {
    const url = `${window.location.origin}/t/${tableId}`
    const text = `شارك في دفع الفاتورة 🍽️\nالمبلغ المتبقي: ${remaining.toFixed(2)} ${currency}\n${url}`
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank')
  }

  const perPerson = (remaining / people).toFixed(2)
  const canPay =
    mode === 'equal' ? true
    : mode === 'custom' ? parseFloat(customAmount) > 0 && parseFloat(customAmount) <= remaining
    : itemsSummary.total > 0

  const payLabel =
    mode === 'equal' ? `ادفع ${perPerson} ${currency}`
    : mode === 'custom' && customAmount ? `ادفع ${parseFloat(customAmount).toFixed(2)} ${currency}`
    : mode === 'items' && itemsSummary.total > 0 ? `ادفع ${itemsSummary.total.toFixed(2)} ${currency}`
    : 'اختر أصنافاً للدفع'

  return (
    <div style={s.container}>
      <button style={s.back} onClick={() => navigate(-1)}>←</button>
      <div style={s.title}>تقسيم الفاتورة</div>
      <div style={s.subtitle}>المتبقي: {remaining.toFixed(2)} {currency}</div>

      <div style={s.tab}>
        <button style={s.tabBtn(mode === 'equal')} onClick={() => setMode('equal')}>متساوي</button>
        <button style={s.tabBtn(mode === 'items')} onClick={() => setMode('items')}>حسب الأصناف</button>
        <button style={s.tabBtn(mode === 'custom')} onClick={() => setMode('custom')}>مبلغ محدد</button>
      </div>

      {/* ── Equal split ── */}
      {mode === 'equal' && (
        <div style={s.card}>
          <div style={{ marginBottom: '1rem', fontSize: 14, color: '#666' }}>عدد الأشخاص</div>
          <div style={s.counter}>
            <button style={s.counterBtn} onClick={() => setPeople(Math.max(2, people - 1))}>−</button>
            <div style={s.counterVal}>{people}</div>
            <button style={s.counterBtn} onClick={() => setPeople(people + 1)}>+</button>
          </div>
          <hr style={s.divider} />
          {Array.from({ length: people }).map((_, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.6rem 0', borderBottom: i < people - 1 ? '0.5px solid #f0f0f0' : 'none' }}>
              <span style={{ fontSize: 15, fontWeight: 500 }}>شخص {i + 1}</span>
              <span style={{ fontSize: 15, color: '#1b5e20', fontWeight: 600 }}>{perPerson} {currency}</span>
            </div>
          ))}
          <div style={{ fontSize: 12, color: '#aaa', marginTop: 8, textAlign: 'center' }}>
            يشمل الضريبة موزّعة بالتساوي
          </div>
        </div>
      )}

      {/* ── Item split ── */}
      {mode === 'items' && (
        <div style={s.card}>
          <div style={{ fontSize: 14, color: '#666', marginBottom: '1rem' }}>
            اختر الأصناف التي ستدفع عنها — الضريبة تُحسب تلقائياً
          </div>

          {bill.items.map((item, i) => {
            const qtyPaid = paidQtyMap[i] || 0
            const qtyAvailable = item.quantity - qtyPaid
            const isFullyPaid = qtyAvailable <= 0
            const isPartiallyPaid = qtyPaid > 0 && !isFullyPaid
            const isSelected = selectedQty[i] !== undefined
            const qtyChosen = selectedQty[i] || 0
            const unitPrice = Number(item.total_price) / Number(item.quantity)
            const chosenSubtotal = (unitPrice * qtyChosen).toFixed(2)
            const hasMultiple = qtyAvailable > 1

            return (
              <div key={i}>
                <div
                  style={s.itemRow(isSelected, isFullyPaid)}
                  onClick={() => !isFullyPaid && toggleItem(i)}
                >
                  <div style={s.checkbox(isSelected, isFullyPaid)}>
                    {isFullyPaid ? '✓' : isSelected ? '✓' : ''}
                  </div>
                  <div style={s.itemInfo}>
                    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}>
                      <span style={{ ...s.itemName, textDecoration: isFullyPaid ? 'line-through' : 'none' }}>
                        {item.name_ar || item.name}
                      </span>
                      {isFullyPaid && <span style={s.paidBadge}>✓ مدفوع</span>}
                      {isPartiallyPaid && <span style={s.partialBadge}>{qtyPaid} مدفوع</span>}
                    </div>
                    <div style={s.itemMeta}>
                      {isFullyPaid
                        ? `${item.quantity} قطعة — مسدّدة`
                        : isPartiallyPaid
                        ? `${qtyAvailable} متبقي من ${item.quantity} · ${unitPrice.toFixed(2)} ${currency} للقطعة`
                        : item.quantity > 1
                        ? `${item.quantity} قطعة · ${unitPrice.toFixed(2)} ${currency} للقطعة`
                        : `${unitPrice.toFixed(2)} ${currency}`
                      }
                    </div>

                    {/* Quantity picker — shown when selected and more than 1 available */}
                    {isSelected && hasMultiple && (
                      <div style={s.qtyRow}>
                        <span style={s.qtyLabel}>كم قطعة؟</span>
                        <div style={s.qtyBtns}>
                          <button style={s.qtyBtn} onClick={e => { e.stopPropagation(); setItemQty(i, qtyChosen - 1) }}>−</button>
                          <span style={s.qtyVal}>{qtyChosen}</span>
                          <button style={s.qtyBtn} onClick={e => { e.stopPropagation(); setItemQty(i, qtyChosen + 1) }}>+</button>
                          <span style={{ fontSize: 11, color: '#aaa', marginInlineStart: 4 }}>/ {qtyAvailable}</span>
                        </div>
                      </div>
                    )}
                  </div>
                  <div style={s.itemPrice}>
                    {isFullyPaid
                      ? `${Number(item.total_price).toFixed(2)}`
                      : isSelected && hasMultiple
                      ? `${chosenSubtotal}`
                      : `${(unitPrice * qtyAvailable).toFixed(2)}`
                    } {currency}
                  </div>
                </div>
              </div>
            )
          })}

          {/* Summary with tax breakdown */}
          {itemsSummary.total > 0 ? (
            <div style={s.summaryBox}>
              <div style={s.summaryRow}>
                <span>مجموع الأصناف</span>
                <span>{itemsSummary.subtotal.toFixed(2)} {currency}</span>
              </div>
              {itemsSummary.taxShare > 0 && (
                <div style={s.summaryRow}>
                  <span>حصتك من الضريبة</span>
                  <span>{itemsSummary.taxShare.toFixed(2)} {currency}</span>
                </div>
              )}
              <div style={s.summaryTotal}>
                <span>إجمالي ما ستدفعه</span>
                <span>{itemsSummary.total.toFixed(2)} {currency}</span>
              </div>
            </div>
          ) : (
            <div style={s.hint}>اختر صنفاً واحداً على الأقل</div>
          )}
        </div>
      )}

      {/* ── Custom amount ── */}
      {mode === 'custom' && (
        <div style={s.card}>
          <div style={{ marginBottom: 8, fontSize: 14, color: '#666' }}>كم تريد أن تدفع؟</div>
          <input
            style={s.input}
            type="number"
            placeholder={`0.00 ${currency}`}
            value={customAmount}
            onChange={e => setCustomAmount(e.target.value)}
            min="0.01" max={remaining} step="0.01"
          />
          {parseFloat(customAmount) > remaining && (
            <p style={{ color: '#c62828', fontSize: 13 }}>المبلغ يتجاوز المتبقي ({remaining.toFixed(2)} {currency})</p>
          )}
          <div style={{ fontSize: 12, color: '#aaa' }}>الضريبة مشمولة في المبلغ المتبقي</div>
        </div>
      )}

      <button style={s.shareBtn} onClick={shareWhatsApp}>
        <span>💬</span> شارك الرابط مع أصدقائك
      </button>

      <button style={s.btn(!canPay)} onClick={handlePay} disabled={!canPay}>
        {payLabel}
      </button>
    </div>
  )
}
