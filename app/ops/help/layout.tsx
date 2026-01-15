export const runtime = "nodejs";

export const metadata = {
  title: "Help Center | PsillyOps",
  description: "Internal Help Center for PsillyOps",
  robots: {
    index: false,
    follow: false,
  },
};

export default function HelpLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}


