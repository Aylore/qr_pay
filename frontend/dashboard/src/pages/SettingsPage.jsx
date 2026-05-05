import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { restaurant } from '../api'

const s = {
  page: { minHeight: '100vh', background: '#f4f6f9', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' },
  nav: { background: '#1b5e20', color: 'white', padding: '1rem 1.5rem', display: 'flex', alignItems: 'center', gap: 12 },
  backBtn: { background: 'none', border: 'none', color: 'white', fontSize: 22, cursor: 'pointer' },
  navTitle: { fontSize: 17, fontWeight: 600 },
  body: { padding: '1.25rem', maxWidth: 560, margin: '0 auto' },
  card: { background: 'white', borderRadius: 16, padding: '1.25rem', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginBottom: '1rem' },
  sectionTitle: { fontSize: 13, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: '1rem' },
  label: { fontSize: 13, fontWeight: 500, color: '#555', marginBottom: 6, display: 'block' },
  input: { width: '100%', padding: '11px 13px', border: '1.5px solid #e0e0e0', borderRadius: 10, fontSize: 14, outline: 'none', boxSizing: 'border-box', marginBottom: '1rem' },
  inputFocus: { borderColor: '#1b5e20' },
  hint: { fontSize: 12, color: '#aaa', marginTop: -10, marginBottom: '1rem', lineHeight: 1.5 },
  btn: (variant) => ({
    padding: '11px 20px', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer',
    background: variant === 'primary' ? '#1b5e20' : variant === 'danger' ? '#ffebee' : 'transparent',
    color: variant === 'primary' ? 'white' : variant === 'danger' ? '#c62828' : '#1b5e20',
    border: variant === 'primary' ? 'none' : variant === 'danger' ? '1px solid #ef9a9a' : '1.5px solid #1b5e20',
  }),
  row: { display: 'flex', gap: 10, justifyContent: 'flex-end' },
  success: { background: '#e8f5e9', color: '#2e7d32', borderRadius: 10, padding: '10px 12px', fontSize: 13, marginBottom: '1rem' },
  error: { background: '#ffebee', color: '#c62828', borderRadius: 10, padding: '10px 12px', fontSize: 13, marginBottom: '1rem' },
  gatewayStatus: (hasKey) => ({
    display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600,
    padding: '4px 10px', borderRadius: 20,
    background: hasKey ? '#e8f5e9' : '#fff3e0',
    color: hasKey ? '#2e7d32' : '#e65100',
  }),
  keyMask: { fontFamily: 'monospace', fontSize: 13, color: '#888', background: '#f5f5f5', padding: '8px 12px', borderRadius: 8, marginBottom: '1rem', letterSpacing: 1 },
  divider: { border: 'none', borderTop: '0.5px solid #f0f0f0', margin: '1rem 0' },
}

export default function SettingsPage() {
  const navigate = useNavigate()
  const [info, setInfo] = useState(null)
  const [form, setForm] = useState({ name: '', name_ar: '', gateway_api_key: '' })
  const [showKey, setShowKey] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null) // { type: 'success'|'error', text }

  useEffect(() => {
    restaurant.me().then(r => {
      setInfo(r)
      setForm(f => ({ ...f, name: r.name || '', name_ar: r.name_ar || '' }))
    })
  }, [])

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  const handleSave = async () => {
    setSaving(true)
    setMsg(null)
    try {
      const payload = {}
      if (form.name) payload.name = form.name
      if (form.name_ar) payload.name_ar = form.name_ar
      if (form.gateway_api_key) payload.gateway_api_key = form.gateway_api_key

      const updated = await restaurant.update(payload)
      setInfo(updated)
      setForm(f => ({ ...f, gateway_api_key: '' })) // clear key after save
      setShowKey(false)
      setMsg({ type: 'success', text: 'تم حفظ الإعدادات بنجاح' })
    } catch (e) {
      setMsg({ type: 'error', text: e.message })
    } finally {
      setSaving(false)
    }
  }

  // Mask the stored key for display
  const maskedKey = info?.gateway_api_key_stored
    ? '••••••••••••' + (info.gateway_api_key_stored?.slice(-4) || '')
    : null

  return (
    <div style={s.page}>
      <div style={s.nav}>
        <button style={s.backBtn} onClick={() => navigate('/')}>←</button>
        <div style={s.navTitle}>الإعدادات</div>
      </div>

      <div style={s.body}>
        {msg && (
          <div style={msg.type === 'success' ? s.success : s.error}>
            {msg.type === 'success' ? '✅' : '⚠️'} {msg.text}
          </div>
        )}

        {/* Restaurant profile */}
        <div style={s.card}>
          <div style={s.sectionTitle}>معلومات المطعم</div>
          <label style={s.label}>الاسم (إنجليزي)</label>
          <input style={s.input} value={form.name} onChange={set('name')} placeholder="Cafe Nile" />

          <label style={s.label}>الاسم (عربي)</label>
          <input style={s.input} value={form.name_ar} onChange={set('name_ar')} placeholder="كافيه النيل" />
        </div>

        {/* Payment gateway config */}
        <div style={s.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div style={s.sectionTitle} style={{ margin: 0 }}>بوابة الدفع (APS)</div>
            <div style={s.gatewayStatus(info?.gateway_api_key_enc)}>
              {info?.gateway_api_key_enc ? '🔐 مُعيَّن' : '⚠️ غير مُعيَّن'}
            </div>
          </div>

          <p style={{ fontSize: 13, color: '#888', lineHeight: 1.6, marginBottom: '1rem' }}>
            أدخل معرّف التاجر الخاص بك من لوحة تحكم Amazon Payment Services.
            يُخزَّن مشفّراً بـ AES-256 ولا يظهر مرةً أخرى بعد الحفظ.
          </p>

          {info?.gateway_api_key_enc && !showKey && (
            <>
              <div style={s.keyMask}>••••••••••••••••</div>
              <button style={{ ...s.btn('outline'), marginBottom: '1rem', fontSize: 13, padding: '8px 14px' }}
                      onClick={() => setShowKey(true)}>
                تغيير المفتاح
              </button>
            </>
          )}

          {(!info?.gateway_api_key_enc || showKey) && (
            <>
              <label style={s.label}>Merchant ID / Access Code</label>
              <input
                style={s.input}
                type="password"
                placeholder="your-aps-merchant-id"
                value={form.gateway_api_key}
                onChange={set('gateway_api_key')}
                autoComplete="off"
              />
              <p style={s.hint}>
                احصل عليه من: APS Dashboard → My Account → Merchant Settings
              </p>
            </>
          )}

          <hr style={s.divider} />

          {/* Instructions */}
          <div style={{ fontSize: 13, color: '#888', lineHeight: 1.7 }}>
            <strong style={{ color: '#555', display: 'block', marginBottom: 6 }}>
              كيف يعمل بدون مفتاح؟
            </strong>
            إذا لم تُعيِّن مفتاحاً، يستخدم النظام <code style={{ background: '#f5f5f5', padding: '1px 5px', borderRadius: 4 }}>mock-merchant-id-demo</code> تلقائياً
            — وهو يعمل مع بوابة الدفع التجريبية فقط.
            لأي مدفوعات حقيقية، أدخل المفتاح أولاً.
          </div>
        </div>

        {/* Foodics integration info */}
        <div style={s.card}>
          <div style={s.sectionTitle}>تكامل Foodics</div>
          <p style={{ fontSize: 13, color: '#888', lineHeight: 1.7, marginBottom: '1rem' }}>
            لتلقي الفواتير تلقائياً من Foodics، أعطِ فريق Foodics هذه المعلومات:
          </p>
          <div style={{ fontSize: 13 }}>
            <div style={{ marginBottom: 8 }}>
              <strong style={{ color: '#555' }}>Webhook URL:</strong>
              <div style={{ ...s.keyMask, letterSpacing: 0, fontFamily: 'monospace', fontSize: 12, marginTop: 4 }}>
                POST {window.location.origin.replace('5174', '8000')}/webhooks/foodics
              </div>
            </div>
            <div>
              <strong style={{ color: '#555' }}>Restaurant ID (Header X-Restaurant-Id):</strong>
              <div style={{ ...s.keyMask, letterSpacing: 0, fontFamily: 'monospace', fontSize: 12, marginTop: 4 }}>
                {info?.id || '—'}
              </div>
            </div>
          </div>
        </div>

        <div style={s.row}>
          <button style={s.btn('primary')} onClick={handleSave} disabled={saving}>
            {saving ? 'جارٍ الحفظ...' : 'حفظ الإعدادات'}
          </button>
        </div>
      </div>
    </div>
  )
}
