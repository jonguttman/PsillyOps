import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'PsillyOps - Inventory Management System',
  description: 'Complete inventory management for mushroom supplement production',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}


