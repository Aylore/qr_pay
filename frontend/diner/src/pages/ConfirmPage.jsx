import { useEffect, useState } from 'react'
import { useParams, useSearchParams, useNavigate } from 'react-router-dom'

/**
 * ConfirmPage — shown after the mock gateway redirects the diner back.
 * The gateway result page (served by FastAPI) is shown in the gateway tab.
 * This page is the PWA's own "you're back" screen.
 *
 * We poll the bill status for up to 10 seconds to confirm payment landed,
 * then show a final success or retry screen.
 */

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const s = {
  page: {
    minHeight: '100vh', display: 'flex', alignItems: 'center',
    justifyContent: 'center', background: '#f4f6f9', padding: '1.5rem',
    fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
  },
  card: {
    background: 'white', borderRadius: 20, padding: '2.5rem 2rem',
    maxWidth: 380, width: '100%', textAlign: 'center',
    boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
  },
  icon: { fontSize: 64, marginBottom: '1rem' },
  title: { fontSize: 22, fontWeight: 700, color: '#1a1a2e', marginBottom: 8 },
  subtitle: { fontSize: 15, color: '#888', lineHeight: 1.6, marginBottom: '1.5rem' },
  amount: { fontSize: 28, fontWeight: 700, color: '#1b5e20', marginBottom: '1.5rem' },
  btn: (primary) => ({
    width: '100%', padding: '14px', borderRadius: 12, fontSize: 15,
    fontWeight: 600, cursor: 'pointer', marginBottom: 10,
    background: primary ? '#1b5e20' : 'transparent',
    color: primary ? 'white' : '#1b5e20',
    border: primary ? 'none' : '1.5px solid #1b5e20',
  }),
  spinner: {
    width: 48, height: 48, border: '4px solid #e0e0e0',
    borderTopColor: '#1b5e20', borderRadius: '50%',
    animation: 'spin 0.8s linear infinite', margin: '0 auto 1.5rem',
  },
  progress: {
    width: '100%', height: 4, background: '#e0e0e0', borderRadius: 4,
    overflow: 'hidden', margin: '1rem 0',
  },
  progressBar: (pct) => ({
    height: '100%', background: '#1b5e20', borderRadius: 4,
    width: `${pct}%`, transition: 'width 0.5s ease',
  }),
}

const POLL_INTERVAL = 1000
const MAX_POLLS = 10

export default function ConfirmPage() {
  const { tableId } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  const billId = searchParams.get('bill_id')
  const expectedAmount = searchParams.get('amount')

  const [phase, setPhase] = useState('polling') // 'polling' | 'success' | 'partial' | 'failed' | 'timeout'
  const [bill, setBill] = useState(null)
  const [polls, setPolls] = useState(0)

  useEffect(() => {
    if (!billId) {
      setPhase('failed')
      return
    }

    let count = 0
    const interval = setInterval(async () => {
      count++
      setPolls(count)
      try {
        const res = await fetch(`${BASE}/t/${tableId}`)
        if (!res.ok) {
          clearInterval(interval)
          setPhase('failed')
          return
        }
        const data = await res.json()
        setBill(data)

        if (data.status === 'settled') {
          clearInterval(interval)
          setPhase('success')
        } else if (data.status === 'partial') {
          // Check if a new payment landed since we started
          const newPayments = data.payment_intents?.filter(p => p.status === 'completed') || []
          if (newPayments.length > 0) {
            clearInterval(interval)
            setPhase('partial')
          }
        }

        if (count >= MAX_POLLS) {
          clearInterval(interval)
          setPhase('timeout')
        }
      } catch {
        if (count >= MAX_POLLS) {
          clearInterval(interval)
          setPhase('timeout')
        }
      }
    }, POLL_INTERVAL)

    return () => clearInterval(interval)
  }, [billId, tableId])

  const currency = bill?.currency || 'EGP'

  const goBack = () => navigate(`/t/${tableId}`)

  if (phase === 'polling') {
    return (
      <div style={s.page}>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <div style={s.card}>
          <div style={s.spinner} />
          <div style={s.title}>جارٍ التحقق...</div>
          <div style={s.subtitle}>نتحقق من استلام دفعتك</div>
          <div style={s.progress}>
            <div style={s.progressBar((polls / MAX_POLLS) * 100)} />
          </div>
        </div>
      </div>
    )
  }

  if (phase === 'success') {
    return (
      <div style={s.page}>
        <div style={s.card}>
          <div style={s.icon}>✅</div>
          <div style={s.title}>تم الدفع!</div>
          <div style={s.subtitle}>
            تم سداد الفاتورة بالكامل.{'\n'}شكراً لزيارتكم، نراكم قريباً 🎉
          </div>
          {bill && (
            <div style={s.amount}>
              {Number(bill.total).toFixed(2)} {currency}
            </div>
          )}
          <button style={s.btn(false)} onClick={() => window.close()}>إغلاق</button>
        </div>
      </div>
    )
  }

  if (phase === 'partial') {
    const remaining = bill ? Number(bill.amount_remaining).toFixed(2) : '—'
    const paid = bill ? Number(bill.amount_paid).toFixed(2) : '—'
    return (
      <div style={s.page}>
        <div style={s.card}>
          <div style={s.icon}>👍</div>
          <div style={s.title}>تم استلام دفعتك</div>
          <div style={s.subtitle}>
            دفعت <strong>{paid} {currency}</strong>.{'\n'}
            لا يزال هناك <strong>{remaining} {currency}</strong> متبقٍ من الفاتورة.
          </div>
          <button style={s.btn(true)} onClick={goBack}>عرض الفاتورة</button>
          <button style={s.btn(false)} onClick={() => window.close()}>إغلاق</button>
        </div>
      </div>
    )
  }

  if (phase === 'timeout') {
    return (
      <div style={s.page}>
        <div style={s.card}>
          <div style={s.icon}>⏳</div>
          <div style={s.title}>يستغرق وقتاً أطول من المعتاد</div>
          <div style={s.subtitle}>
            إذا اكتملت عملية الدفع، ستظهر في الفاتورة خلال لحظات.
            تحقق من الفاتورة أو اسأل موظف المطعم.
          </div>
          <button style={s.btn(true)} onClick={goBack}>عرض الفاتورة</button>
        </div>
      </div>
    )
  }

  // phase === 'failed'
  return (
    <div style={s.page}>
      <div style={s.card}>
        <div style={s.icon}>❌</div>
        <div style={s.title}>فشلت عملية الدفع</div>
        <div style={s.subtitle}>
          لم تكتمل عملية الدفع. لم يتم خصم أي مبلغ من حسابك.
        </div>
        <button style={s.btn(true)} onClick={goBack}>حاول مجدداً</button>
      </div>
    </div>
  )
}
