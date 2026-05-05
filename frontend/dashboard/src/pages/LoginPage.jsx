import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { auth } from '../api'

const s = {
  page: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: '#f4f6f9', padding: '1rem', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' },
  card: { background: 'white', borderRadius: 20, padding: '2.5rem 2rem', maxWidth: 400, width: '100%',
          boxShadow: '0 4px 24px rgba(0,0,0,0.08)' },
  logo: { fontSize: 36, textAlign: 'center', marginBottom: 8 },
  title: { fontSize: 24, fontWeight: 700, textAlign: 'center', color: '#1a1a2e', marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#888', textAlign: 'center', marginBottom: '2rem' },
  label: { fontSize: 13, fontWeight: 500, color: '#555', marginBottom: 6, display: 'block' },
  input: { width: '100%', padding: '12px 14px', border: '1.5px solid #e0e0e0', borderRadius: 10,
           fontSize: 15, outline: 'none', marginBottom: '1rem', boxSizing: 'border-box' },
  btn: (loading) => ({
    width: '100%', padding: '14px', background: loading ? '#81c784' : '#1b5e20',
    color: 'white', border: 'none', borderRadius: 12, fontSize: 16, fontWeight: 600,
    cursor: loading ? 'not-allowed' : 'pointer',
  }),
  error: { background: '#ffebee', color: '#c62828', borderRadius: 10, padding: '10px 12px',
           fontSize: 14, marginBottom: '1rem' },
  toggle: { textAlign: 'center', marginTop: '1rem', fontSize: 14, color: '#888' },
  link: { color: '#1b5e20', fontWeight: 500, cursor: 'pointer', textDecoration: 'underline' },
}

export default function LoginPage() {
  const navigate = useNavigate()
  const [mode, setMode] = useState('login') // 'login' | 'register'
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  const handleSubmit = async () => {
    setLoading(true)
    setError(null)
    try {
      if (mode === 'login') {
        const res = await auth.login(form.email, form.password)
        localStorage.setItem('qrpay_token', res.access_token)
        navigate('/')
      } else {
        await auth.register({ name: form.name, email: form.email, password: form.password })
        const res = await auth.login(form.email, form.password)
        localStorage.setItem('qrpay_token', res.access_token)
        navigate('/')
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={s.page}>
      <div style={s.card}>
        <div style={s.logo}>🍽️</div>
        <div style={s.title}>QR Pay</div>
        <div style={s.subtitle}>
          {mode === 'login' ? 'لوحة تحكم المطعم' : 'تسجيل مطعم جديد'}
        </div>

        {error && <div style={s.error}>⚠️ {error}</div>}

        {mode === 'register' && (
          <>
            <label style={s.label}>اسم المطعم</label>
            <input style={s.input} placeholder="مثال: كافيه النيل" value={form.name} onChange={set('name')} />
          </>
        )}

        <label style={s.label}>البريد الإلكتروني</label>
        <input style={s.input} type="email" placeholder="you@restaurant.com" value={form.email} onChange={set('email')} />

        <label style={s.label}>كلمة المرور</label>
        <input style={s.input} type="password" placeholder="••••••••" value={form.password} onChange={set('password')}
               onKeyDown={e => e.key === 'Enter' && handleSubmit()} />

        <button style={s.btn(loading)} onClick={handleSubmit} disabled={loading}>
          {loading ? 'جارٍ...' : mode === 'login' ? 'تسجيل الدخول' : 'إنشاء حساب'}
        </button>

        <div style={s.toggle}>
          {mode === 'login' ? (
            <>مطعم جديد؟ <span style={s.link} onClick={() => setMode('register')}>سجّل هنا</span></>
          ) : (
            <>لديك حساب؟ <span style={s.link} onClick={() => setMode('login')}>ادخل هنا</span></>
          )}
        </div>
      </div>
    </div>
  )
}
