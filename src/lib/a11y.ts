/**
 * Küçük erişilebilirlik (a11y) yardımcıları.
 *
 * Modal gibi geçici katmanlar için dört işlev:
 *  1. Odak hapsi (Tab / Shift+Tab döngüsü) — `trapFocus`
 *  2. Odak taşıma ve geri yükleme — `focusElement`, `rememberFocusedElement`, `restoreFocus`
 *  3. Gövde kaydırma kilidi — `lockBodyScroll`
 *  4. Arka planı ekran okuyuculardan gizleme — `hideSurroundingContent`
 *
 * Tümü bağımlılıksızdır ve tarayıcıda doğrudan DOM üzerinde çalışır.
 */

/** Sekme sırasına girebilecek öğeler için birleşik seçici. */
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'button',
  'input',
  'select',
  'textarea',
  'iframe',
  'object',
  'embed',
  'summary',
  'audio[controls]',
  'video[controls]',
  '[contenteditable]:not([contenteditable="false"])',
  '[tabindex]',
].join(',')

/** Bu tarayıcı `inert` özniteliğini destekliyor mu? (Safari 15.5+, Chrome 102+, Firefox 112+) */
export function supportsInert(): boolean {
  return typeof HTMLElement !== 'undefined' && 'inert' in HTMLElement.prototype
}

/** Verilen öğe şu an gerçekten odaklanabilir mi? (devre dışı / gizli / görünmez elenır) */
function isFocusable(el: HTMLElement): boolean {
  // contenteditable öğelerde `tabIndex` bazı tarayıcılarda -1 döner, yine de odaklanabilirler
  if (!el.hasAttribute('contenteditable') && el.tabIndex < 0) return false
  if (el.hasAttribute('disabled')) return false
  if (el.getAttribute('aria-hidden') === 'true') return false
  if (el.closest('[inert]')) return false
  if (el.getClientRects().length === 0) return false // display:none / collapsed
  const style = window.getComputedStyle(el)
  return style.visibility !== 'hidden' && style.display !== 'none'
}

/**
 * Kapsayıcı içindeki odaklanabilir öğeleri DOM sırasıyla döndürür.
 * Görünürlük ve devre dışı durumuna göre süzer; `[tabindex="-1"]` öğeleri dışarıda bırakır.
 */
export function getFocusableElements(container: HTMLElement): HTMLElement[] {
  const found = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
  return found.filter(isFocusable)
}

/**
 * Odağı bir öğeye taşır; sayfa kaymasını (`scroll`) engeller.
 * Diyalog kutusu açılırken panelin kendisine (`tabindex="-1"`) odaklanmak için kullanılır.
 */
export function focusElement(el: HTMLElement | null): void {
  if (!el) return
  try {
    el.focus({ preventScroll: true })
  } catch {
    // çok eski tarayıcıda FocusOptions yoksa sade odakla
    el.focus()
  }
}

/**
 * Tab / Shift+Tab tuşunu `container` içinde döngüye alır.
 *
 * - Odak kapsayıcının dışındaysa (veya panelin kendisindeyse) ilk/son öğeye alınır.
 * - Sınırlara gelindiğinde odak diğer uca sarılır.
 *
 * @returns `preventDefault` çağrıldıysa `true`; odak zaten sınırlar içindeyse `false`.
 */
export function trapFocus(container: HTMLElement, event: KeyboardEvent): boolean {
  if (event.key !== 'Tab' || event.altKey || event.ctrlKey || event.metaKey) return false

  const items = getFocusableElements(container)

  // Hiç odaklanabilir içerik yoksa odak panelin üzerinde kalsın
  if (items.length === 0) {
    event.preventDefault()
    focusElement(container)
    return true
  }

  const active = document.activeElement
  const index = active ? items.indexOf(active as HTMLElement) : -1
  const last = items.length - 1

  // Odak panelde (ya da dışarıdaysa): başa / sona al
  if (index === -1) {
    event.preventDefault()
    focusElement(event.shiftKey ? items[last] : items[0])
    return true
  }

  // Sınıra gelindi: diğer uca sar
  const next = event.shiftKey ? index - 1 : index + 1
  if (next < 0 || next > last) {
    event.preventDefault()
    focusElement(event.shiftKey ? items[last] : items[0])
    return true
  }

  // Arada kaldı: tarayıcının normal ilerlemesine izin ver
  return false
}

/** Modal açılmadan önce odaktaki öğeyi hatırlar. */
export function rememberFocusedElement(): HTMLElement | null {
  const el = document.activeElement
  return el instanceof HTMLElement ? el : null
}

/**
 * Odağı, modal açılmadan önce odakta olan öğeye geri verir.
 * Öğe DOM'dan çıkmışsa (ya da devre dışı kalmışsa) hiçbir şey yapmaz.
 */
export function restoreFocus(target: HTMLElement | null): void {
  if (!target || target === document.body) return
  if (!target.isConnected) return
  if (target.hasAttribute('disabled')) return
  focusElement(target)
}

/**
 * Arka plan kaydırmasını kilitler.
 *
 * @returns kilidi kaldıran fonksiyon. Kilitlenmeden **önceki** `overflow` değerini geri
 * yüklediği için iç içe açılan modal'larda (A açık → B açık → B kapanır → A kapanır)
 * değer doğru sırayla geri gelir. Birden çok kez çağrılsa da tek işe yarar.
 */
export function lockBodyScroll(): () => void {
  const body = document.body
  const previous = body.style.overflow
  body.style.overflow = 'hidden'
  let released = false
  return function release() {
    if (released) return
    released = true
    body.style.overflow = previous
  }
}

/**
 * `keep` öğesinin dışında kalan kardeşleri ekran okuyuculardan gizler;
 * tarayıcı destekliyorsa `inert` ile tıklamaya da kapatır.
 *
 * `keep` öğesinin kendisi, alt öğeleri ve **atası asla gizlenmez** — bu sayede modal
 * (portal ile `document.body` altına basıldığında) `#root` içinde kalmaya devam eder ve
 * ekran okuyucuya açık kalır.
 *
 * DİKKAT: `inert` öğeyi tıklanamaz (hit-test edilemez) yapar. Bu yüzden `keep` olarak
 * modalın **en dış kökü** verilmelidir; içindeki backdrop'a dokunulmaz, böylece
 * "arkadaşa tıklayınca kapat" davranışı bozulmaz.
 *
 * @returns gizlemeyi tam olarak geri alan fonksiyon.
 */
export function hideSurroundingContent(keep: HTMLElement | null): () => void {
  if (!keep) return () => {}

  const useInert = supportsInert()
  const touched: Array<{ el: HTMLElement; ariaHidden: string | null; inert: boolean }> = []

  // keep'ten yukarı doğru yürü; her seviyede kendisini içermeyen kardeşleri gizle
  let node: HTMLElement | null = keep
  while (node && node.parentElement && node.parentElement !== document.documentElement) {
    const parent: HTMLElement = node.parentElement
    for (const child of Array.from(parent.children)) {
      if (child === node || !(child instanceof HTMLElement)) continue
      touched.push({ el: child, ariaHidden: child.getAttribute('aria-hidden'), inert: child.inert })
      child.setAttribute('aria-hidden', 'true')
      if (useInert) child.inert = true
    }
    node = parent
  }

  return function reveal() {
    for (const t of touched) {
      if (t.ariaHidden === null) t.el.removeAttribute('aria-hidden')
      else t.el.setAttribute('aria-hidden', t.ariaHidden)
      if (useInert) t.el.inert = t.inert
    }
    touched.length = 0
  }
}