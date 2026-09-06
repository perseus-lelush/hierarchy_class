# Supabase Auth Email Setup - Hierarchy Class branding

The signup confirmation and password-reset emails are sent by **Supabase
Auth** with its default (unbranded) sender. This guide switches them to the
Hierarchy Class identity: sent from `noreply@www.hierarchyclass.com` via
Resend, with the HC logo/colors in the body.

Ready-to-paste HTML lives in this folder:

| Template | Paste into (Supabase Dashboard) |
|---|---|
| `confirm-signup.html` | Authentication → Emails → Templates → **Confirm signup** |
| `reset-password.html` | Authentication → Emails → Templates → **Reset password** |

Both use the `{{ .ConfirmationURL }}` variable - do not remove it.

## 1. Verify the sending domain (one-time)

1. https://resend.com/domains → **Add domain** → `www.hierarchyclass.com`
2. Resend shows DKIM/SPF/DMARC DNS records.
3. Add them in **Cloudflare → DNS → Records** for hierarchyclass.com.
   **Set every mail record to DNS-only (gray cloud)** - proxied (orange)
   records break verification and delivery.
4. Wait for Resend to mark the domain **Verified**.

## 2. Connect Supabase to Resend (custom SMTP)

Supabase Dashboard → Project Settings → **Authentication → SMTP Settings**
→ enable **Custom SMTP**:

| Field | Value |
|---|---|
| Host | `smtp.resend.com` |
| Port | `587` |
| Username | `resend` |
| Password | your Resend API key (`re_...`) |
| Sender email | `noreply@www.hierarchyclass.com` |
| Sender name | `Hierarchy Class` |

Custom SMTP also removes Supabase's strict default email rate limits
(an hourly cap that can throttle real signups).

## 3. Apply the templates

Open each file above, copy the HTML, and paste it into the matching
template's **Source** view. Save.

## 4. Test

- Sign up with a fresh address → the confirmation email must arrive from
  `Hierarchy Class <noreply@www.hierarchyclass.com>` with the HC logo and
  Midnight-theme card.
- "Forgot password" → same branding with the reset link.

If mail lands in spam, re-check that the Cloudflare records are DNS-only
and that DMARC is present.
