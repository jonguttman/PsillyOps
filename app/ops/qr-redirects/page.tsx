// Redirect from old /ops/qr-redirects to new /ops/qr/redirects
import { redirect } from 'next/navigation';

export default function QRRedirectsRedirectPage() {
  redirect('/ops/qr/redirects');
}
