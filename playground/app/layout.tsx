import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import './globals.css'

export const metadata: Metadata = {
  title: 'overink · vector ink layer for the web',
  description:
    'A pressure-sensitive ink canvas you can mount on top of any editor. Palm rejection, low latency, strokes as portable JSON.',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
