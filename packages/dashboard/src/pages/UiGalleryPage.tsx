import { useSearchParams } from 'react-router-dom'
import { Download, Inbox, Loader2, Monitor, Plus, RefreshCw, Search, ServerCog, Trash2 } from 'lucide-react'
import { Alert } from '../components/ui/Alert'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card, CardBody, CardHeader } from '../components/ui/Card'
import { EmptyState } from '../components/ui/EmptyState'
import { Field } from '../components/ui/Field'
import { Input } from '../components/ui/Input'
import { Select } from '../components/ui/Select'
import { Skeleton, SkeletonRows } from '../components/ui/Skeleton'
import { Switch } from '../components/ui/Switch'
import { DataTable } from '../components/ui/Table'

/**
 * لوحة عرض المكوّنات — أداة قياس بصرية للمرحلتين 2 و3.
 * تُفتح على /dev/ui، وتقبل ?only=button|field|switch|badge|card|table|states
 * لتصوير قسم واحد بكل حالاته عبر scripts/shot-gallery.cjs.
 */

const SECTIONS = ['button', 'field', 'switch', 'badge', 'card', 'table', 'states'] as const
type Section = typeof SECTIONS[number]

const TITLES: Record<Section, string> = {
  button: 'الزر — 30px · 26px صغير · 44px لمس',
  field: 'الحقل — 32px · حالات خمس',
  switch: 'المفتاح — 38×22 · لمس 44×26',
  badge: 'شارة الحالة — 22px',
  card: 'البطاقة — رأس (عنوان + وصف + شارة) + جسم + تذييل',
  table: 'الجدول — صف 36px · أربع حالات',
  states: 'حالات السطح الأربع — طبيعي · فارغ · تحميل · خطأ'
}

function Block ({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="text-[12px] font-medium text-muted">{title}{note ? ' — ' + note : ''}</div>
      <div className="rounded-xl border border-line bg-surface p-3">{children}</div>
    </div>
  )
}

const DEVICES = [
  { id: 'b42175d0', name: 'WIN10-VM', platform: 'Windows 10', status: 'online', cpu: 12.7 },
  { id: 'd147684b', name: 'WIN11-VM', platform: 'Windows 11', status: 'online', cpu: 22.4 },
  { id: '9b5eeaf9', name: 'Android-Emulator', platform: 'Android 13', status: 'busy', cpu: 41.2 },
  { id: 'e0000001', name: 'TECNO-KL4', platform: 'Android 12', status: 'offline', cpu: 0 }
]

const COLUMNS = [
  { key: 'name', header: 'الجهاز', render: (d: typeof DEVICES[number]) => <span className="font-medium">{d.name}</span> },
  { key: 'platform', header: 'النظام' },
  { key: 'status', header: 'الحالة', render: (d: typeof DEVICES[number]) => (
    <Badge tone={d.status === 'online' ? 'success' : d.status === 'busy' ? 'warning' : 'neutral'}>
      {d.status === 'online' ? 'متصل' : d.status === 'busy' ? 'مشغول' : 'غير متصل'}
    </Badge>
  ) },
  { key: 'cpu', header: 'CPU', align: 'end' as const, render: (d: typeof DEVICES[number]) => d.cpu ? d.cpu.toFixed(1) + '%' : '—' }
]

export function UiGalleryPage () {
  const [params] = useSearchParams()
  const only = params.get('only') as Section | null
  const show = (s: Section) => !only || only === s

  return (
    <div className="min-h-screen bg-canvas p-6 text-ink">
      <div className="mx-auto max-w-[1080px] space-y-6">
        <header className="space-y-1">
          <h1 className="text-[16px] font-semibold">مكتبة المكوّنات — AiRemote</h1>
          <p className="text-[11px] text-muted">
            المرجع البصري: <code>design/server.html</code> · الرموز من <code>index.css</code> · القياس عبر <code>scripts/shot-gallery.cjs</code>
          </p>
        </header>

        {show('button') && (
          <section data-section="button" className="space-y-3">
            <h2 className="text-[16px] font-semibold">{TITLES.button}</h2>
            <Block title="الأنواع" note="افتراضي">
              <div className="flex flex-wrap items-center gap-2">
                <Button id="btn-primary" size="md" variant="primary" icon={<Plus size={14} />}>إضافة جهاز</Button>
                <Button variant="secondary" icon={<RefreshCw size={13} />}>تحديث</Button>
                <Button variant="ghost" icon={<Search size={13} />}>بحث</Button>
                <Button variant="danger" icon={<Trash2 size={13} />}>حذف</Button>
              </div>
            </Block>
            <Block title="المقاسات" note="30 أساسي · 26 صغير">
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="primary">حفظ</Button>
                <Button variant="primary" size="sm">حفظ</Button>
                <Button variant="secondary" size="sm">إلغاء</Button>
              </div>
            </Block>
            <Block title="الحالات" note="hover/focus تُصوَّر بمؤشّر حقيقي عبر CDP">
              <div className="flex flex-wrap items-center gap-2">
                <Button id="btn-hover-target" variant="primary">hover</Button>
                <Button id="btn-focus-target" variant="secondary">focus-visible</Button>
                <Button variant="secondary" disabled>معطّل</Button>
                <Button variant="primary" loading>جارٍ الحفظ</Button>
                <Button id="btn-loading" variant="secondary" loading size="sm">تحميل</Button>
              </div>
            </Block>
          </section>
        )}

        {show('field') && (
          <section data-section="field" className="space-y-3">
            <h2 className="text-[16px] font-semibold">{TITLES.field}</h2>
            <Block title="الحالات" note="عادي · تركيز · خطأ · معطّل · قراءة فقط">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="عنوان الخادم" hint="wss://…">
                  <Input id="field-normal" placeholder="wss://your-server/ws" />
                </Field>
                <Field label="تركيز">
                  <Input id="field-focus-target" defaultValue="wss://127.0.0.1:3001/ws" />
                </Field>
                <Field label="كلمة السر" error="كلمة السر غير صحيحة — تبقّى محاولتان">
                  <Input invalid defaultValue="••••••" type="password" />
                </Field>
                <Field label="معطّل">
                  <Input disabled defaultValue="غير متاح" />
                </Field>
                <Field label="قراءة فقط" hint="قيمة محسوبة من الخادم">
                  <Input readOnly defaultValue="/opt/airemote" />
                </Field>
                <Field label="قائمة">
                  <Select defaultValue="all">
                    <option value="all">كل الأجهزة</option>
                    <option value="online">المتصلة</option>
                    <option value="offline">غير المتصلة</option>
                  </Select>
                </Field>
              </div>
            </Block>
          </section>
        )}

        {show('switch') && (
          <section data-section="switch" className="space-y-3">
            <h2 className="text-[16px] font-semibold">{TITLES.switch}</h2>
            <Block title="الحالات الأربع" note="مفعّل · متوقّف · معطّل · قيد الانتظار">
              <div className="flex flex-wrap items-center gap-6">
                <Switch checked label="البث التلقائي" />
                <Switch checked={false} label="الإخفاء إلى العلبة" />
                <Switch checked disabled label="معطّل" />
                <Switch checked pending label="قيد الانتظار" />
                <Switch checked touch label="لمس 44×26" />
              </div>
            </Block>
          </section>
        )}

        {show('badge') && (
          <section data-section="badge" className="space-y-3">
            <h2 className="text-[16px] font-semibold">{TITLES.badge}</h2>
            <Block title="الأنماط" note="نجاح · تحذير · خطر · محايد · معلومات">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="success">متصل</Badge>
                <Badge tone="warning">مشغول</Badge>
                <Badge tone="danger">خطأ</Badge>
                <Badge tone="neutral">غير متصل</Badge>
                <Badge tone="info">قيد المزامنة</Badge>
              </div>
            </Block>
          </section>
        )}

        {show('card') && (
          <section data-section="card" className="space-y-3">
            <h2 className="text-[16px] font-semibold">{TITLES.card}</h2>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <Card>
                <CardHeader
                  icon={<Monitor size={14} />}
                  title="WIN10-VM"
                  subtitle="Windows 10 · 192.168.1.24"
                  actions={<Badge tone="success">متصل</Badge>}
                />
                <CardBody className="space-y-2">
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="text-muted">CPU</span><span>12.7%</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-surface2">
                    <div className="h-full w-[37%] rounded-full bg-primary" />
                  </div>
                </CardBody>
                <div className="flex items-center justify-between border-t border-line px-3 py-2">
                  <span className="text-[11px] text-muted">آخر ظهور: الآن</span>
                  <Button size="sm" variant="ghost">فتح</Button>
                </div>
              </Card>

              <Card>
                <CardHeader icon={<ServerCog size={14} />} title="لا أجهزة للمراقبة" subtitle="أضف جهازًا للبدء" actions={<Badge tone="neutral">فارغ</Badge>} />
                <CardBody>
                  <EmptyState
                    icon={<Inbox size={18} />}
                    title="لا أجهزة"
                    description="ثبّت الوكيل على الجهاز ثم اقترنه بالخادم."
                    action={<Button variant="primary" size="sm" icon={<Plus size={13} />}>إضافة جهاز</Button>}
                  />
                </CardBody>
              </Card>
            </div>
          </section>
        )}

        {show('table') && (
          <section data-section="table" className="space-y-3">
            <h2 className="text-[16px] font-semibold">{TITLES.table}</h2>
            <Block title="طبيعي" note="صف hover مثبّت للتصوير">
              <DataTable columns={COLUMNS} rows={DEVICES} rowKey={d => d.id} hoverRowKey="9b5eeaf9" onRowClick={() => {}} />
            </Block>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
              <Block title="فارغ">
                <div className="overflow-x-auto"><DataTable columns={COLUMNS} rows={[]} rowKey={d => d.id} empty="لا أجهزة للمراقبة — أضف جهازًا" /></div>
              </Block>
              <Block title="خطأ">
                <div className="overflow-x-auto"><DataTable columns={COLUMNS} rows={[]} rowKey={d => d.id} error="تعذّر تحميل الأجهزة — أعد المحاولة" /></div>
              </Block>
              <Block title="تحميل">
                <div className="overflow-x-auto"><DataTable columns={COLUMNS} rows={[]} rowKey={d => d.id} loading /></div>
              </Block>
            </div>
          </section>
        )}

        {show('states') && (
          <section data-section="states" className="space-y-3">
            <h2 className="text-[16px] font-semibold">{TITLES.states}</h2>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <Card>
                <CardHeader title="طبيعي" actions={<Badge tone="success">متصل</Badge>} />
                <CardBody className="space-y-2">
                  <div className="flex items-center gap-2 text-[13px]"><Monitor size={14} className="text-muted" /> WIN11-VM — 1920×1080 · 22.4% CPU</div>
                  <div className="flex gap-2"><Button size="sm" variant="primary">بث</Button><Button size="sm">تفاصيل</Button></div>
                </CardBody>
              </Card>

              <Card>
                <CardHeader title="فارغ" actions={<Badge tone="neutral">0</Badge>} />
                <CardBody>
                  <EmptyState icon={<Inbox size={18} />} title="لا جلسات بعد" description="ستظهر الجلسات هنا بعد أول اتصال." />
                </CardBody>
              </Card>

              <Card>
                <CardHeader title="تحميل" actions={<Loader2 size={14} className="animate-spin text-muted" />} />
                <CardBody className="space-y-2">
                  <Skeleton className="h-3 w-2/3" />
                  <SkeletonRows rows={2} />
                </CardBody>
              </Card>

              <Card>
                <CardHeader title="خطأ" actions={<Badge tone="danger">فشل</Badge>} />
                <CardBody>
                  <Alert tone="danger" title="تعذّر الاتصال بالخادم">
                    تحقّق من العنوان ثم أعد المحاولة.
                  </Alert>
                  <div className="mt-2"><Button size="sm" variant="secondary" icon={<RefreshCw size={13} />}>إعادة المحاولة</Button></div>
                </CardBody>
              </Card>
            </div>
            <Block title="تنزيل" note="زر بأيقونة وحالة تحميل">
              <div className="flex gap-2">
                <Button variant="primary" icon={<Download size={13} />}>تنزيل</Button>
                <Button variant="secondary" loading icon={<Download size={13} />}>جارٍ التنزيل</Button>
              </div>
            </Block>
          </section>
        )}
      </div>
    </div>
  )
}
