import type { Metadata, Viewport } from 'next'
import { Anek_Bangla, Archivo, Inter, JetBrains_Mono } from 'next/font/google'

import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' })
const archivo = Archivo({ subsets: ['latin'], variable: '--font-archivo', display: 'swap' })
const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
})
// Floor staff run the app in Bangla; the token file already routes :lang(bn) here.
const anekBangla = Anek_Bangla({
  subsets: ['bengali'],
  variable: '--font-anek-bangla',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'FabricXAI',
  description: 'AI-powered ERP for garment export factories',
  icons: { icon: '/brand/marbim-logo.png' },
}

export const viewport: Viewport = {
  themeColor: '#0A0E17',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      // `density` switches row heights and tap targets for shared floor tablets;
      // `perf` drops glass/backdrop-filter on low-end devices (theme.css).
      data-density="desk"
      data-perf="high"
      className={`${inter.variable} ${archivo.variable} ${jetbrainsMono.variable} ${anekBangla.variable}`}
    >
      <body>{children}</body>
    </html>
  )
}
