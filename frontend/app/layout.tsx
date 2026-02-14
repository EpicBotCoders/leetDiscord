import type { Metadata, Viewport } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'
import Script from 'next/script'

import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })
const jetbrainsMono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jetbrains-mono' })

export const metadata: Metadata = {
  title: 'LeetDiscord — Track LeetCode Activity in Discord',
  description:
    'LeetDiscord helps Discord communities track LeetCode activity, stay accountable, showcase progress, and drive engagement around coding practice.',
  keywords: ['LeetCode', 'Discord', 'Bot', 'Coding', 'Tracking', 'Community', 'Developer', 'Programming'],
  authors: [{ name: 'mochiron-desu', url: 'https://github.com/mochiron-desu' }],
  creator: 'mochiron-desu',
  icons: {
    icon: '/icon.svg',
    shortcut: '/icon.svg',
    apple: '/icon.svg',
  },
  openGraph: {
    title: 'LeetDiscord — Track LeetCode Activity in Discord',
    description: 'LeetDiscord helps Discord communities track LeetCode activity, stay accountable, showcase progress, and drive engagement around coding practice.',
    siteName: 'LeetDiscord',
    locale: 'en_US',
    type: 'website',
    images: [
      {
        url: '/landing_page.png',
        width: 1200,
        height: 630,
        alt: 'LeetDiscord Landing Page',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'LeetDiscord — Track LeetCode Activity in Discord',
    description: 'LeetDiscord helps Discord communities track LeetCode activity, stay accountable, showcase progress, and drive engagement around coding practice.',
    creator: '@mochiron_desu',
    images: ['/landing_page.png'],
  },
}

export const viewport: Viewport = {
  themeColor: '#16a34a',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <head>
        {/* Google tag (gtag.js) */}
        <Script
          async
          src="https://www.googletagmanager.com/gtag/js?id=G-TMHKTKN4V4"
          strategy="afterInteractive"
        />
        <Script
          id="google-analytics"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', 'G-TMHKTKN4V4');
            `,
          }}
        />
      </head>
      <body className={`${inter.variable} ${jetbrainsMono.variable} font-sans antialiased`}>
        {children}
      </body>
    </html>
  )
}
