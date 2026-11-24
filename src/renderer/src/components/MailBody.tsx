import React, { useCallback, useEffect, useMemo, useRef } from 'react'
import DOMPurify from 'dompurify'
import { useTheme } from '../theme/ThemeContext'
import { escapeHtml } from '../utils/quote'

// Remote url(...) inside CSS — stripped (with <img> src) until the user allows remote content,
// because they work exactly like tracking pixels.
const REMOTE_CSS_URL = /url\(\s*(['"]?)(https?:\/\/[^'")]+)\1\s*\)/gi

function stripRemoteCssUrls(css: string): string {
  return css.replace(REMOTE_CSS_URL, 'none').replace(/@import\s+(url\()?['"]?https?:\/\/[^;]+;?/gi, '')
}

export function sanitizeMailHtml(html: string, allowRemoteImages: boolean): string {
  const clean = DOMPurify.sanitize(html, {
    // <style> stays: real-world HTML mail depends on it. <link> goes: it would fetch remote CSS.
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'link', 'base'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick']
  })
  const container = document.createElement('div')
  container.innerHTML = clean
  if (!allowRemoteImages) {
    container.querySelectorAll('img').forEach((img) => {
      const src = img.getAttribute('src') ?? ''
      if (!src.startsWith('data:')) {
        img.setAttribute('data-blocked-src', src)
        img.removeAttribute('src')
      }
    })
    container.querySelectorAll<HTMLElement>('[style]').forEach((el) => {
      const style = el.getAttribute('style')
      REMOTE_CSS_URL.lastIndex = 0
      if (style && REMOTE_CSS_URL.test(style)) el.setAttribute('style', stripRemoteCssUrls(style))
      REMOTE_CSS_URL.lastIndex = 0
    })
    container.querySelectorAll('style').forEach((tag) => {
      tag.textContent = stripRemoteCssUrls(tag.textContent ?? '')
    })
  }
  return container.innerHTML
}

export const hasRemoteImages = (html: string | null | undefined): boolean => Boolean(html && /<img[^>]+src=["']?https?:/i.test(html))

const mailColors = ['--panel', '--ink', '--ink-2', '--line-strong', '--accent-ink']
const readingZoom = { standard: 1, large: 1.15, extraLarge: 1.35 }

interface MailBodyProps {
  html: string | null
  plain: string | null
  allowRemoteImages: boolean
  title: string
  /** 'fill' stretches to the parent (reader); 'auto' grows to the content height (thread view). */
  sizing?: 'fill' | 'auto'
}

/** Sanitized mail HTML in a sandboxed iframe; links open in the system browser. */
export function MailBody({ html, plain, allowRemoteImages, title, sizing = 'fill' }: MailBodyProps): JSX.Element {
  const ref = useRef<HTMLIFrameElement>(null)
  const { resolvedTheme, appearance: { accent, readingSize } } = useTheme()

  const applyFrameAppearance = useCallback((doc: Document): void => {
    if (!doc.body) return
    const { style } = doc.documentElement
    const colors = getComputedStyle(document.documentElement)
    for (const token of mailColors) style.setProperty(token, colors.getPropertyValue(token))
    style.colorScheme = resolvedTheme

    const zoom = readingZoom[readingSize]
    doc.body.style.zoom = String(zoom)
    if (sizing === 'auto' && ref.current) {
      const contentHeight = Math.max(doc.body.getBoundingClientRect().height, doc.body.scrollHeight * zoom)
      ref.current.style.height = `${Math.ceil(contentHeight)}px`
    }
  }, [readingSize, resolvedTheme, sizing])

  useEffect(() => {
    const doc = ref.current?.contentDocument
    if (doc) applyFrameAppearance(doc)
  }, [accent, applyFrameAppearance])

  const srcDoc = useMemo(() => {
    const body = html ? sanitizeMailHtml(html, allowRemoteImages) : `<pre style="white-space:pre-wrap;font:inherit">${escapeHtml(plain ?? '')}</pre>`
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
*{box-sizing:border-box}
html,body{background:var(--panel,Canvas);color:var(--ink,CanvasText);font-family:"Segoe UI Variable Text","Segoe UI",system-ui,sans-serif;font-size:14.5px;line-height:1.65;overflow-wrap:anywhere}
body{margin:0;padding:4px 32px ${sizing === 'fill' ? 40 : 8}px;max-width:820px}
a{color:var(--accent-ink,LinkText)}
blockquote{margin:0 0 1em;padding-left:12px;border-left:2px solid var(--line-strong,GrayText);color:var(--ink-2,CanvasText)}
hr{border:0;border-top:1px solid var(--line-strong,GrayText)}
img{max-width:100%;height:auto}
table{max-width:100%}
pre,code{font-family:"Cascadia Mono",Consolas,monospace;font-size:.9em}
pre{white-space:pre-wrap}
</style></head><body>${body}</body></html>`
  }, [html, plain, allowRemoteImages, sizing])

  return (
    <iframe
      ref={ref}
      title={title}
      sandbox="allow-same-origin"
      srcDoc={srcDoc}
      className={sizing === 'fill' ? 'absolute inset-0 w-full h-full border-0 bg-panel' : 'block w-full border-0 bg-panel'}
      onLoad={() => {
        const doc = ref.current?.contentDocument
        if (!doc) return
        applyFrameAppearance(doc)
        // The sandbox blocks navigation; route link clicks to the system browser instead.
        doc.addEventListener('click', (event) => {
          const href = (event.target as HTMLElement | null)?.closest('a')?.getAttribute('href')
          if (!href) return
          event.preventDefault()
          if (/^(https?:|mailto:)/i.test(href)) window.mailapp.shell.openExternal(href)
        })
      }}
    />
  )
}
