import type { Metadata } from 'next'
import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'
import '../styles.css'

export const metadata: Metadata = {
  title: 'Alpha Workbench · 美股策略回测',
  description: '美股量化研究台：用历史日线验证信号、交易成本、换仓与持仓组合对比。',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  )
}
