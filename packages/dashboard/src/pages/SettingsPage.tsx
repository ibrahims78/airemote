import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Settings, Server, Bot, Bell, Save, Check, Eye, EyeOff,
  RefreshCw, Info, Sun, Moon, Globe, Copy, Wifi, WifiOff, Loader,
  History, Shield, Users
} from 'lucide-react'
import { api } from '../lib/api'
import { useUIStore } from '../store/uiStore'
import { useT } from '../lib/i18n'
import { toast } from '../store/toastStore'
import { clsx } from 'clsx'
import { useAuthStore } from '../store/authStore'
import { APP_VERSION } from '../lib/version'
import { SessionsPage } from './SessionsPage'
import { NotificationsPage } from './NotificationsPage'
import { AuditPage } from './AuditPage'
import { UsersPage } from './UsersPage'

interface AISettings {
  aiProvider: 'openai' | 'gemini' | 'ollama' | 'zai'
  aiModel: string
  aiApiKey: string
  ollamaUrl: string
}

const MODELS: Record<string, string[]> = {
  openai: ['openai', 'openai-fast', 'gpt-6.1-sol', 'gpt-6-astra', 'gpt-6-sol', 'gpt-6-luna'],
  gemini: ['gemini-3.8-flash', 'gemini-3.5-flash', 'gemini-2.5-flash', 'gemini-2.5-pro'],
  ollama: ['qwen3', 'deepseek-r1', 'gemma3', 'llama3.3', 'phi4', 'gpt-oss'],
  zai: ['glm-4.7-flash', 'glm-4.5-flash', 'glm-4.6v-flash', 'glm-5.3-flash', 'glm-4.7', 'glm-5.3']
}

type ValidateState = 'idle' | 'loading' | 'ok' | 'error'

// v3.3.4 — Section lives at module level: defining it inside the component
// recreated it on every render, remounting all fields on each keystroke
// (which caused the settings page to jump to the top while typing).
import { TwoFactorSection, TasksSection } from '../components/SettingsExtra'

function Section({ icon: Icon, color, title, children }: { icon: React.ElementType; color: string; title: string; children: React.ReactNode }) {
  return (
    <section className="cr-card cr-settings-section">
      <div className="cr-settings-section-head">
        <span className={clsx('cr-settings-section-icon', color)}><Icon size={15} /></span>
        <h3>{title}</h3>
      </div>
      <div className="cr-settings-section-body">{children}</div>
    </section>
  )
}

export function SettingsPage() {
  const [ai, setAi] = useState<AISettings>({ aiProvider: 'openai', aiModel: 'gpt-4o', aiApiKey: '', ollamaUrl: '' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [showKey, setShowKey] = useState(false)
  const [telegramToken, setTelegramToken] = useState('')
  const [telegramChatId, setTelegramChatId] = useState('')
  const [telegramEnabled, setTelegramEnabled] = useState(false)
  const [tgEvents, setTgEvents] = useState<{ online: boolean; offline: boolean; chat: boolean }>({ online: true, offline: true, chat: true })
  const [tgTest, setTgTest] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle')
  const [tgTestMsg, setTgTestMsg] = useState('')
  const [copied, setCopied] = useState(false)
  const [validateState, setValidateState] = useState<ValidateState>('idle')
  const [validateMsg, setValidateMsg] = useState('')
  const [appVersion, setAppVersion] = useState('')
  const [cfgMap, setCfgMap] = useState<Record<string, { apiKey?: string; model?: string; baseUrl?: string }>>({})
  const { theme, toggleTheme, lang, toggleLang } = useUIStore()
  const T = useT()
  const isAr = lang === 'ar'
  const { user } = useAuthStore()
  const isAdmin = user?.role === 'admin'
  const [searchParams, setSearchParams] = useSearchParams()
  const tabItems = [
    { id: 'general', label: isAr ? 'عام' : 'General', icon: Settings },
    { id: 'sessions', label: T('sessions'), icon: History },
    { id: 'notifications', label: T('nav_notifications'), icon: Bell },
    { id: 'audit', label: T('nav_audit'), icon: Shield, adminOnly: true },
    { id: 'users', label: T('users'), icon: Users, adminOnly: true },
  ].filter(item => !(item as { adminOnly?: boolean }).adminOnly || isAdmin)
  const requestedTab = searchParams.get('tab') || 'general'
  const tab = tabItems.some(item => item.id === requestedTab) ? requestedTab : 'general'
  const selectTab = (id: string) => setSearchParams({ tab: id }, { replace: true })

  useEffect(() => {
    api.get('/api/settings').then(res => {
      const d = res.data
      setAi({
        aiProvider: d.aiProvider || 'openai',
        aiModel: d.aiModel || 'gpt-4o',
        aiApiKey: d.aiApiKey || '',
        ollamaUrl: d.ollamaUrl || ''
      })
      setTelegramToken(d.telegramToken || '')
      setTelegramChatId(d.telegramChatId || '')
      setTelegramEnabled(d.telegramEnabled === true || d.telegramEnabled === 'true')
      if (d.telegramEvents && typeof d.telegramEvents === 'object') setTgEvents(p => ({ ...p, ...d.telegramEvents }))
      if (d.aiConfigs && typeof d.aiConfigs === 'object') setCfgMap(d.aiConfigs)
    }).catch(() => {}).finally(() => setLoading(false))
    api.get('/api/health').then(r => setAppVersion(r.data?.version || '')).catch(() => {})
  }, [])

  async function handleSave() {
    setSaving(true)
    try {
      // PUT replaces the settings row; merge first so a partial save never
      // wipes AI provider configs or other sections.
      const current = await api.get('/api/settings')
      await api.put('/api/settings', {
        ...(current.data || {}),
        ...ai,
        telegramToken, telegramChatId, telegramEnabled, telegramEvents: tgEvents,
      })
      // Sync AI config to localStorage so AiChatPanel picks it up immediately
      localStorage.setItem('airemote-ai-config', JSON.stringify({
        provider: ai.aiProvider,
        model:    ai.aiModel,
        apiKey:   ai.aiApiKey,
        baseUrl:  ai.ollamaUrl || '',
      }))
      setCfgMap(prev => ({ ...prev, [ai.aiProvider]: { apiKey: ai.aiApiKey, model: ai.aiModel, baseUrl: ai.ollamaUrl } }))
      setSaved(true)
      setValidateState('idle')
      toast.success(T('toast_settings_saved'))
      setTimeout(() => setSaved(false), 2500)
    } catch {
      toast.error(T('save_failed'))
    } finally {
      setSaving(false)
    }
  }

  async function handleValidate() {
    setValidateState('loading')
    setValidateMsg('')
    try {
      const config = {
        provider: ai.aiProvider,
        model: ai.aiModel,
        apiKey: ai.aiApiKey || undefined,
        baseUrl: ai.ollamaUrl || undefined,
      }
      const res = await api.post('/api/ai/validate', { config })
      setValidateState('ok')
      setValidateMsg(res.data?.detail || (isAr ? 'الاتصال ناجح' : 'Connection successful'))
      toast.success(isAr ? 'مفتاح API يعمل بشكل صحيح' : 'API key is valid and working')
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } }
      const msg = err.response?.data?.error || 'Connection failed'
      setValidateState('error')
      setValidateMsg(msg)
    }
  }

  async function handleTelegramTest() {
    setTgTest('loading'); setTgTestMsg('')
    try {
      const res = await api.post('/api/settings/telegram/test', { token: telegramToken, chatId: telegramChatId })
      setTgTest('ok')
      setTgTestMsg(isAr ? ('تم الإرسال بنجاح' + (res.data?.bot ? ' — البوت: @' + res.data.bot : '')) : 'Sent successfully')
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } }
      setTgTest('error')
      setTgTestMsg(err.response?.data?.error || 'Send failed')
    }
  }

  const wsUrl = window.location.origin.replace(/^https?:\/\//, m => m === 'https://' ? 'wss://' : 'ws://') + '/ws'

  function copyServerUrl() {
    navigator.clipboard.writeText(window.location.origin)
    setCopied(true)
    toast.success(T('toast_copy_done'), window.location.origin)
    setTimeout(() => setCopied(false), 2000)
  }

  const [copiedWs, setCopiedWs] = useState(false)
  function copyWsUrl() {
    navigator.clipboard.writeText(wsUrl)
    setCopiedWs(true)
    toast.success(isAr ? 'تم نسخ عنوان الـ WebSocket' : 'WebSocket URL copied', wsUrl)
    setTimeout(() => setCopiedWs(false), 2000)
  }

  const availableModels = MODELS[ai.aiProvider] || []

  return (
    <div className="cr-page">
      <div className="flex items-start justify-between mb-4 flex-wrap gap-3">
        <div>
          <h2 className="cr-page-title">{T('settings_title')}</h2>
          <p className="cr-page-subtitle">
            {isAr ? 'النظام، الجلسات، التنبيهات، سجل التدقيق، والمستخدمون في مكان واحد.' : 'System, sessions, notifications, audit, and users in one place.'}
          </p>
        </div>
        {tab === 'general' && (
          <button
            onClick={handleSave}
            disabled={saving}
            className={clsx(
              'flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg transition-all flex-shrink-0',
              saved ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' :
              'bg-brand-blue hover:bg-blue-500 disabled:opacity-50 text-white shadow-lg shadow-brand-blue/15'
            )}
          >
            {saving ? <RefreshCw size={14} className="animate-spin" /> : saved ? <Check size={14} /> : <Save size={14} />}
            {saving ? T('saving') : saved ? T('saved') : T('save_settings')}
          </button>
        )}
      </div>

      <div className="cr-settings-tabs" role="tablist" aria-label={isAr ? 'أقسام الإعدادات' : 'Settings sections'}>
        {tabItems.map(item => {
          const Icon = item.icon
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              data-tab={item.id}
              aria-selected={tab === item.id}
              className={clsx('cr-settings-tab', tab === item.id && 'is-active')}
              onClick={() => selectTab(item.id)}
            >
              <Icon size={14} />
              <span>{item.label}</span>
            </button>
          )
        })}
      </div>

      {tab === 'general' && (loading ? (
        <div className="text-center py-12 text-slate-500">
          <div className="w-5 h-5 border-2 border-brand-blue border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          {T('loading')}
        </div>
      ) : (
        <div className="grid gap-4 max-w-3xl w-full mx-auto">

          {/* Appearance & Language */}
          <Section icon={Globe} color="text-brand-teal" title={T('appearance')}>
            <div className="grid grid-cols-2 gap-3">
              {/* Theme */}
              <div>
                <label className="block text-xs text-slate-500 mb-2">{T('theme_label')}</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => theme !== 'dark' && toggleTheme()}
                    className={clsx(
                      'flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-medium border transition-all',
                      theme === 'dark'
                        ? 'bg-slate-700/50 border-brand-blue/40 text-brand-blue'
                        : 'border-slate-600 text-slate-400 hover:border-slate-500 hover:text-slate-300'
                    )}
                  >
                    <Moon size={13} /> {T('theme_dark')}
                  </button>
                  <button
                    onClick={() => theme !== 'light' && toggleTheme()}
                    className={clsx(
                      'flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-medium border transition-all',
                      theme === 'light'
                        ? 'bg-amber-400/10 border-amber-400/40 text-amber-400'
                        : 'border-slate-600 text-slate-400 hover:border-slate-500 hover:text-slate-300'
                    )}
                  >
                    <Sun size={13} /> {T('theme_light')}
                  </button>
                </div>
              </div>
              {/* Language */}
              <div>
                <label className="block text-xs text-slate-500 mb-2">{T('lang_label')}</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => lang !== 'ar' && toggleLang()}
                    className={clsx(
                      'flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-medium border transition-all',
                      lang === 'ar'
                        ? 'bg-brand-blue/10 border-brand-blue/40 text-brand-blue'
                        : 'border-slate-600 text-slate-400 hover:border-slate-500 hover:text-slate-300'
                    )}
                  >
                    {T('lang_ar')}
                  </button>
                  <button
                    onClick={() => lang !== 'en' && toggleLang()}
                    className={clsx(
                      'flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-medium border transition-all',
                      lang === 'en'
                        ? 'bg-brand-blue/10 border-brand-blue/40 text-brand-blue'
                        : 'border-slate-600 text-slate-400 hover:border-slate-500 hover:text-slate-300'
                    )}
                  >
                    {T('lang_en')}
                  </button>
                </div>
              </div>
            </div>
          </Section>

          {/* Server Info */}
          <Section icon={Server} color="text-brand-blue" title={T('server_info')}>
            <div className="space-y-3">
              {/* HTTP URL */}
              <div>
                <label className="block text-xs text-slate-500 mb-1.5">{T('server_address')}</label>
                <div className="flex items-center gap-2">
                  <input
                    readOnly value={window.location.origin}
                    className="flex-1 bg-navy-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-400 font-mono"
                    dir="ltr"
                  />
                  <button
                    onClick={copyServerUrl}
                    className={clsx(
                      'p-2 border rounded-lg transition-colors flex-shrink-0',
                      copied ? 'text-emerald-400 border-emerald-500/30 bg-emerald-400/10' : 'text-slate-500 hover:text-white bg-navy-900 border-slate-700'
                    )}
                  >
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                </div>
              </div>

              {/* WebSocket URL — for Desktop Agent */}
              <div>
                <label className="block text-xs text-slate-500 mb-1.5">
                  {T('ws_url_label')}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    readOnly value={wsUrl}
                    className="flex-1 bg-navy-900 border border-brand-teal/40 rounded-lg px-3 py-2 text-sm text-brand-teal font-mono"
                    dir="ltr"
                  />
                  <button
                    onClick={copyWsUrl}
                    className={clsx(
                      'p-2 border rounded-lg transition-colors flex-shrink-0',
                      copiedWs ? 'text-emerald-400 border-emerald-500/30 bg-emerald-400/10' : 'text-brand-teal border-brand-teal/30 hover:bg-brand-teal/10 bg-navy-900'
                    )}
                  >
                    {copiedWs ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                </div>
                <p className="text-xs text-brand-teal/60 mt-1.5 flex items-center gap-1.5">
                  <Info size={11} />
                  {T('ws_url_hint')}
                </p>
              </div>

              <div className="flex items-start gap-2 text-xs text-slate-500 bg-slate-700/20 rounded-lg p-3">
                <Info size={13} className="text-brand-blue flex-shrink-0 mt-0.5" />
                <span>{T('server_address_hint')}</span>
              </div>
            </div>
          </Section>

          {/* AI Settings */}
          <Section icon={Bot} color="text-brand-teal" title={T('ai_settings')}>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1.5">{T('ai_provider')}</label>
                  <select
                    value={ai.aiProvider}
                    onChange={e => {
                      const prov = e.target.value as AISettings['aiProvider']
                      const map = { ...cfgMap, [ai.aiProvider]: { apiKey: ai.aiApiKey, model: ai.aiModel, baseUrl: ai.ollamaUrl } }
                      setCfgMap(map)
                      const sv = map[prov]
                      setAi({ aiProvider: prov, aiModel: sv?.model || MODELS[prov]?.[0] || '', aiApiKey: sv?.apiKey || '', ollamaUrl: sv?.baseUrl || '' })
                      setValidateState('idle')
                    }}
                    className="w-full bg-navy-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-brand-teal"
                    dir="ltr"
                  >
                    <option value="openai">OpenAI</option>
                    <option value="gemini">Google Gemini</option>
                    <option value="zai">Z.ai (GLM)</option>
                    <option value="ollama">{isAr ? 'Ollama (محلي)' : 'Ollama (Local)'}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1.5">{T('ai_model')}</label>
                  <select
                    value={ai.aiModel}
                    onChange={e => { setAi(p => ({ ...p, aiModel: e.target.value })); setValidateState('idle') }}
                    className="w-full bg-navy-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-brand-teal"
                    dir="ltr"
                  >
                    {availableModels.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
              </div>

              {ai.aiProvider !== 'ollama' ? (
                <div>
                  <label className="block text-xs text-slate-500 mb-1.5">
                    {ai.aiProvider === 'openai' ? 'OpenAI API Key' : ai.aiProvider === 'zai' ? 'Z.ai API Key' : 'Gemini API Key'}
                  </label>
                  <div className="relative">
                    <input
                      type={showKey ? 'text' : 'password'}
                      value={ai.aiApiKey}
                      onChange={e => { setAi(p => ({ ...p, aiApiKey: e.target.value })); setValidateState('idle') }}
                      placeholder={ai.aiProvider === 'openai' ? 'sk-...' : ai.aiProvider === 'zai' ? 'Z.ai API key' : 'AI...'}
                      className="w-full bg-navy-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-brand-teal font-mono pe-10"
                      dir="ltr"
                    />
                    <button type="button" onClick={() => setShowKey(s => !s)} className="absolute end-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors">
                      {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-xs text-slate-500 mb-1.5">Ollama URL</label>
                  <input
                    type="text"
                    value={ai.ollamaUrl}
                    onChange={e => { setAi(p => ({ ...p, ollamaUrl: e.target.value })); setValidateState('idle') }}
                    placeholder="http://localhost:11434"
                    className="w-full bg-navy-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-brand-teal font-mono"
                    dir="ltr"
                  />
                </div>
              )}

              {(ai.aiProvider === 'openai' || ai.aiProvider === 'zai') && (
                <div>
                  <label className="block text-xs text-slate-500 mb-1.5">{isAr ? 'عنوان API مخصص (اختياري)' : 'Custom API Base URL (optional)'}</label>
                  <input
                    type="text"
                    value={ai.ollamaUrl}
                    onChange={e => { setAi(p => ({ ...p, ollamaUrl: e.target.value })); setValidateState('idle') }}
                    placeholder={ai.aiProvider === 'zai' ? 'https://api.z.ai/api/paas/v4' : 'https://api.openai.com'}
                    className="w-full bg-navy-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-brand-teal font-mono"
                    dir="ltr"
                  />
                </div>
              )}

              {/* Validate button */}
              <div className="flex items-center gap-3 pt-1">
                <button
                  onClick={handleValidate}
                  disabled={validateState === 'loading' || (ai.aiProvider !== 'ollama' && !ai.aiApiKey.trim() && !/pollinations/i.test(ai.ollamaUrl || ''))}
                  className={clsx(
                    'flex items-center gap-2 text-xs font-medium px-3 py-2 rounded-lg border transition-all disabled:opacity-40 disabled:cursor-not-allowed',
                    validateState === 'ok'
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                      : validateState === 'error'
                        ? 'bg-red-500/10 border-red-500/30 text-red-400'
                        : 'bg-slate-700/30 border-slate-600 text-slate-300 hover:border-brand-teal hover:text-brand-teal'
                  )}
                >
                  {validateState === 'loading' ? (
                    <><Loader size={12} className="animate-spin" /> {isAr ? 'جاري الاختبار...' : 'Testing...'}</>
                  ) : validateState === 'ok' ? (
                    <><Wifi size={12} /> {isAr ? 'الاتصال ناجح' : 'Connected'}</>
                  ) : validateState === 'error' ? (
                    <><WifiOff size={12} /> {isAr ? 'فشل الاتصال' : 'Failed'}</>
                  ) : (
                    <><Wifi size={12} /> {isAr ? 'اختبار الاتصال' : 'Test Connection'}</>
                  )}
                </button>
                {validateMsg && validateState !== 'loading' && (
                  <p className={clsx('text-xs', validateState === 'ok' ? 'text-emerald-400' : 'text-red-400')}>
                    {validateMsg}
                  </p>
                )}
              </div>
            </div>
          </Section>

          {/* Notifications — Telegram (v3.3.0) */}
          <TwoFactorSection />
        <TasksSection />

        <Section icon={Bell} color="text-yellow-400" title={T('notifications')}>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1.5">{isAr ? 'توكن البوت (Bot Token)' : 'Bot Token'}</label>
                  <input
                    type="password"
                    value={telegramToken}
                    onChange={e => setTelegramToken(e.target.value)}
                    placeholder="1234567890:ABCdefGHI..."
                    className="w-full bg-navy-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-yellow-400 font-mono"
                    dir="ltr"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1.5">{isAr ? 'معرّف المحادثة (Chat ID)' : 'Chat ID'}</label>
                  <input
                    type="text"
                    value={telegramChatId}
                    onChange={e => setTelegramChatId(e.target.value)}
                    placeholder="1029428155"
                    className="w-full bg-navy-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-yellow-400 font-mono"
                    dir="ltr"
                  />
                </div>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <button
                  onClick={handleTelegramTest}
                  disabled={tgTest === 'loading' || !telegramToken || !telegramChatId}
                  className={clsx(
                    'flex items-center gap-2 text-xs font-medium px-3 py-2 rounded-lg border transition-all disabled:opacity-40 disabled:cursor-not-allowed',
                    tgTest === 'ok' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' :
                    tgTest === 'error' ? 'bg-red-500/10 border-red-500/30 text-red-400' :
                    'bg-slate-700/30 border-slate-600 text-slate-300 hover:border-yellow-400 hover:text-yellow-400'
                  )}
                >
                  {tgTest === 'loading' ? <><Loader size={12} className="animate-spin" /> {isAr ? 'جارٍ الإرسال...' : 'Sending...'}</> :
                   tgTest === 'ok' ? <><Wifi size={12} /> {isAr ? 'تم الإرسال' : 'Sent'}</> :
                   tgTest === 'error' ? <><WifiOff size={12} /> {isAr ? 'فشل' : 'Failed'}</> :
                   <><Bell size={12} /> {isAr ? 'إرسال رسالة اختبار' : 'Send Test Message'}</>}
                </button>
                {tgTestMsg && tgTest !== 'loading' && (
                  <p className={clsx('text-xs', tgTest === 'ok' ? 'text-emerald-400' : 'text-red-400')}>{tgTestMsg}</p>
                )}
              </div>
              <div className="pt-1">
                <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                  <input type="checkbox" checked={telegramEnabled} onChange={e => setTelegramEnabled(e.target.checked)} className="accent-yellow-400" />
                  {isAr ? 'تفعيل إشعارات Telegram' : 'Enable Telegram notifications'}
                </label>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {([{ key: 'online' as const, label: 'اتصال جهاز' }, { key: 'offline' as const, label: 'انقطاع جهاز' }, { key: 'chat' as const, label: 'رسائل الدردشة' }]).map(ev => (
                  <label key={ev.key} className="flex items-center gap-1.5 text-[11px] text-slate-400 bg-slate-700/20 rounded-lg px-2 py-1.5 cursor-pointer">
                    <input type="checkbox" checked={!!tgEvents[ev.key]} onChange={e => setTgEvents(p => ({ ...p, [ev.key]: e.target.checked }))} className="accent-yellow-400" />
                    {isAr ? ev.label : ev.key}
                  </label>
                ))}
              </div>
              <div className="flex items-start gap-2 text-xs text-slate-500 bg-slate-700/20 rounded-lg p-3">
                <Info size={13} className="text-yellow-400 flex-shrink-0 mt-0.5" />
                <span>{isAr ? 'أنشئ بوتاً عبر @BotFather ثم الصق التوكن هنا، وأرسل /start للبوت من حسابك ثم ضع Chat ID.' : 'Create a bot via @BotFather, paste the token, send /start, and fill the Chat ID.'}</span>
              </div>
            </div>
          </Section>

          {/* Version info */}
          <div className="text-center text-xs text-slate-700 py-2">
            AiRemote v{appVersion || APP_VERSION} — Open Source | <span className="text-slate-600">MIT License</span>
          </div>
        </div>

      ))}

      {tab === 'sessions' && <SessionsPage embedded />}
      {tab === 'notifications' && <NotificationsPage embedded />}
      {tab === 'audit' && isAdmin && <AuditPage embedded />}
      {tab === 'users' && isAdmin && <UsersPage embedded />}
    </div>
  )
}
