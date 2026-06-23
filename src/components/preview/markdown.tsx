'use client'
/**
 * MarkdownLite — tiny, safe markdown → React renderer (headings, bold, bullets,
 * paragraphs). No deps, no dangerouslySetInnerHTML. Used by the preview screens.
 */
import React from 'react'

function renderInline(s: string, keyBase: string): React.ReactNode[] {
  return s.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((p, i) =>
    /^\*\*[^*]+\*\*$/.test(p)
      ? <strong key={`${keyBase}-${i}`} style={{ color: 'var(--text-primary)' }}>{p.slice(2, -2)}</strong>
      : <React.Fragment key={`${keyBase}-${i}`}>{p}</React.Fragment>
  )
}

export function MarkdownLite({ text }: { text: string }) {
  const lines = (text ?? '').split(/\r?\n/)
  const blocks: React.ReactNode[] = []
  let list: string[] = []
  const flush = (k: string) => {
    if (list.length) {
      blocks.push(
        <ul key={`ul-${k}`} style={{ margin: '0 0 12px', paddingLeft: 20, lineHeight: 1.7 }}>
          {list.map((li, i) => <li key={i}>{renderInline(li, `li-${k}-${i}`)}</li>)}
        </ul>
      )
      list = []
    }
  }
  lines.forEach((raw, idx) => {
    const line = raw.trimEnd()
    if (/^#{1,3}\s+/.test(line)) {
      flush(`${idx}`)
      const lvl = line.startsWith('### ') ? 3 : line.startsWith('## ') ? 2 : 1
      blocks.push(
        <div key={`h-${idx}`} style={{
          fontWeight: 'var(--weight-bold)', color: 'var(--text-primary)',
          fontSize: lvl === 1 ? 'var(--text-lg)' : 'var(--text-base)', margin: '16px 0 8px',
        }}>
          {renderInline(line.replace(/^#{1,3}\s+/, ''), `h-${idx}`)}
        </div>
      )
    } else if (/^[-*]\s+/.test(line)) {
      list.push(line.replace(/^[-*]\s+/, ''))
    } else if (line.trim() === '') {
      flush(`${idx}`)
    } else {
      flush(`${idx}`)
      blocks.push(<p key={`p-${idx}`} style={{ margin: '0 0 12px', lineHeight: 1.7 }}>{renderInline(line, `p-${idx}`)}</p>)
    }
  })
  flush('end')
  return <>{blocks}</>
}
