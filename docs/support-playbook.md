# Support playbook

How to handle email to **support@beaten.games** (a Hover email forward to
your own inbox). The public side of this is `/support`; it tells people Beaten
is free and replies may take a while, so there's no SLA to keep.

## The one rule

**Only act on a request that comes from the account's own email address.**
Check the sender against `./deploy/admin.sh find <their username>`. If it
doesn't match, reply asking them to write from the address on the account, and
change nothing. Never ask for, or accept, a password.

Email "From" headers can be forged, so for anything destructive (`delete`,
`change-email`) prefer a step that proves control: send them a reset link
first, or reply and wait for their answer to arrive from that address.

## Tools

All commands run from your Mac in `~/beaten` (needs the AWS CLI login used
for deploys). Messages print to the terminal; nothing secret is shown.

```bash
./deploy/admin.sh find <email | username>          # who is this?
./deploy/admin.sh send-reset <who>                 # password reset email (30 min)
./deploy/admin.sh send-verify <who>                # fresh confirmation email (24 h)
./deploy/admin.sh verify <who>                     # mark email confirmed by hand
./deploy/admin.sh revoke-sessions <who>            # sign out on every device
./deploy/admin.sh change-email <who> <new>         # move account to a new address
./deploy/admin.sh export <who> > their-data.json   # data export (same as Settings)
./deploy/admin.sh delete <who>                     # permanent; asks you to retype
```

Link-sending commands skip the public forms' rate limit (3 per hour per
account and kind), so a stranger hammering "forgot password" can't block a
recovery. `change-email` voids every link sent to the old address. All mail
goes out via Resend with Reply-To set to support@.

Usernames picked at sign-up are only claimed once the email is confirmed
(`verify` claims it too). If someone else confirmed first with the same name,
the account has no username and they pick one in Settings.

## Common requests

| They say | Check | Do |
| --- | --- | --- |
| "I forgot my password" / "reset email never came" | `find` — is "Sign-in" password or Google? Any `RESET_PASSWORD` sent recently? | Google: tell them to use Continue with Google. Otherwise `send-reset`, and ask them to check spam. |
| "Confirmation email never came" | `find` — "Email confirmed: NO"? | `send-verify`. If it still doesn't arrive and they're writing from that address, that itself proves the address: `verify`. |
| "Someone's in my account" | Sender matches? | `revoke-sessions`, then `send-reset`. Suggest a password they don't use elsewhere. |
| "I've lost access to my old email" | `find` on their username. | Hard case — can't verify them. Ask for details only the owner would know (games logged, rough join date, shelf names). If convincing, `change-email` to the new address: it emails a notice to the old address and requires confirming the new one. If in doubt, say no. |
| "I can't sign in, please export my data" | Sender matches? | `export … > file.json` and attach it in your reply. Delete the local file afterwards. |
| "Delete my account" | Sender matches? | Point them to Settings → Delete account first. If they can't sign in, `delete` (they get a confirmation email). |
| "Correct my name/username" | — | Username: Settings → Public profile. Anything else, edit by hand only if it's reasonable. |
| Data protection request (access / erasure) | Sender matches? | Same as export / delete above. Reply within a month. |

## Things to avoid

- Don't paste exports, emails or account details into chats, issues or AI
  tools — they're personal data.
- Don't reveal whether an email address has an account to anyone other than
  that address's owner.
- Don't run `delete` or `change-email` on a request you haven't verified.
