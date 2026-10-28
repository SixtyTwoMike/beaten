# Deploying Beaten to AWS

Two supported paths. **Lightsail is the recommended one** for a personal
project: a single instance at a flat monthly price (bandwidth and a static IP
included), no other billable resources created.

## Option A — Lightsail (recommended, flat-rate)

One instance runs everything: nginx → Node (Next.js standalone) → SQLite on
the instance disk (`/opt/beaten/data/beaten.db`, survives redeploys).
The app is built on your machine and pushed over SSH; no S3 or other
services are involved. The deploy script prints the bundle's exact monthly
price before creating anything (it defaults to the cheapest dual-stack Linux
bundle with ≥ 1 GB RAM).

### One-time IAM setup

Attach `deploy/iam-lightsail-policy.json` (`lightsail:*`) as an inline policy
to the deploying IAM user: IAM console → Users → (deploy user) →
Add permissions → Create inline policy → JSON. Lightsail is a walled garden —
this grant can't create EC2/S3/etc. resources outside it.

### Deploy

The app is built locally (a 1 GB instance cannot survive `next build`) and
pushed over SSH using short-lived Lightsail credentials — no bucket, and the
instance never fetches code from GitHub.

```bash
# First time: creates the instance + static IP, then installs the app
BEATEN_DOMAIN=beaten.example.com ./deploy/deploy-lightsail.sh
```

Then add a DNS **A record** for the domain pointing at the printed static IP,
and once it resolves run:

```bash
./deploy/push-lightsail.sh --no-build   # obtains the Let's Encrypt certificate
```

Instance `beaten-prod` (Ubuntu 24.04, Node 22) in your AWS CLI region, ports
80/443, static IP `beaten-ip` (free while attached). `AUTH_SECRET` is
generated on the instance. IGDB credentials are copied from your local
`.env` (`TWITCH_CLIENT_ID` / `TWITCH_CLIENT_SECRET`) into the root-only
`/etc/beaten.env`.

### Update to latest code

```bash
./deploy/push-lightsail.sh
```

Builds, uploads, verifies the bundle checksum, applies database migrations
(`prisma migrate deploy` — data in `/opt/beaten/data` is kept), and restarts.
Schema changes must come with a migration: `npx prisma migrate dev --name <change>`.

### HTTPS

Handled by the installer: once `BEATEN_DOMAIN` resolves to the instance it
runs certbot (webroot), switches nginx to HTTPS with an HTTP→HTTPS redirect
and HSTS, and certbot's timer renews automatically. To move to a new domain,
change `BEATEN_DOMAIN` and `AUTH_URL` in `/etc/beaten.env` and re-run
`push-lightsail.sh --no-build` (users sign in again on the new domain).

### Support / account queries

```bash
./deploy/admin.sh find someone@example.com      # no args lists all commands
```

Runs `sudo beaten-admin` on the instance (installed with the app; uses the
same short-lived SSH credentials as the push). See `docs/support-playbook.md`.

### Teardown (stops all charges)

```bash
aws lightsail delete-instance --instance-name beaten-prod
aws lightsail release-static-ip --static-ip-name beaten-ip
```

Note: a *stopped* Lightsail instance still bills; delete it to stop charges.
A detached static IP also bills — release it.

### Backups

Optional: `aws lightsail create-instance-snapshot` (billed per GB-month), or
just copy `/opt/beaten/data/beaten.db` somewhere safe from the SSH console.

## Option B — Elastic Beanstalk

`deploy/build-bundle.sh` + `deploy/deploy-eb.sh` deploy a prebuilt bundle to
a single-instance EB environment (t3.micro). Costs are EC2 on-demand pricing
plus a little S3 — typically slightly more than Lightsail and less
predictable. Requires the AWS-managed policy
`AdministratorAccess-AWSElasticBeanstalk` on the deploying user.
See comments in those scripts for details.

## Shared notes

- Elastic Beanstalk serves plain HTTP; Lightsail gets HTTPS automatically
  (see above).
- `AUTH_SECRET` is generated at deploy time and lives in `/etc/beaten.env`
  (Lightsail) or EB environment properties. Rotating it signs everyone out.
- SQLite is fine for one user or a handful; move to Postgres (RDS/Lightsail
  managed DB) if the site ever needs more than one instance.
