// Redirect from old /ops/qr-redirects/new to new /ops/qr/redirects/new
import { redirect } from 'next/navigation';

export default function CreateRedirectRuleRedirectPage() {
  redirect('/ops/qr/redirects/new');
}
