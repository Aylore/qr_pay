const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export async function fetchBill(tableId) {
  const res = await fetch(`${BASE}/t/${tableId}`)
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || 'Could not load bill')
  }
  return res.json()
}

export async function initiatePayment({ billId, amount, paymentMethod, payerName, payerPhone, itemsPaid }) {
  const res = await fetch(`${BASE}/payments/initiate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      bill_id: billId,
      amount: parseFloat(amount),
      payment_method: paymentMethod,
      payer_name: payerName || null,
      payer_phone: payerPhone || null,
      items_paid: itemsPaid || null,
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || 'Payment initiation failed')
  }
  return res.json()
}
