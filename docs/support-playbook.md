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

## Usernames

Profiles live at `beaten.games/<username>` (old `/u/<username>` links
redirect). Usernames can change once every 60 days (the first change after
sign-up is free), and a previous name is held for its old owner for 60 days.

- **Blocked:** names that are pages (`settings`, `login`, …), and swearing and
  slurs. The lists are in `src/lib/username-rules.ts`. **Add any new top-level
  page to `ROUTE_NAMES` before it ships**, or it could clash with a username.
- **Reserved:** well-known people, companies and games (built-in list in the
  same file), plus names you set aside yourself.
- **Saving a name for someone:** `./deploy/admin.sh reserve tolkoto "Mike Minotti"`
  prints an invite link. Send it to them. Only someone with the link can take
  the name, whether they sign up by email or Google, or already have an
  account. Running it again replaces the link.
- `reservations` lists reserved and held names; `unreserve <name>` releases one.
- `check-usernames` lists accounts whose names break the rules, and
  `rename <who> <username>` fixes one (no wait, and the old name isn't held).

## Following, blocking and reports

People follow each other one way, with no approval (like Letterboxd);
profiles stay public. Blocking ends follows both ways and hides each from the
other's feed and "friends who've played this", but not public profiles.

"Report @name" on a profile emails support with the profile link. For a
genuine problem: `./deploy/admin.sh find <who>` to look at the account,
`rename` for an abusive username, `delete <who>` for a spam or abusive
account (it removes their follows, activity and reviews with it). Reply to the
reporter either way.

## Things to avoid

- Don't paste exports, emails or account details into chats, issues or AI
  tools — they're personal data.
- Don't reveal whether an email address has an account to anyone other than
  that address's owner.
- Don't run `delete` or `change-email` on a request you haven't verified.
