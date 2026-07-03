# Deploying Beaten to AWS

Two supported paths. **Lightsail is the recommended one** for a personal
project: a single instance at a flat monthly price (bandwidth and a static IP
included), no other billable resources created.

## Option A — Lightsail (recommended, flat-rate)

One instance runs everything: nginx → Node (Next.js standalone) → SQLite on
the instance disk (`/opt/beaten/data/beaten.db`, survives redeploys).
The instance clones this public repo and builds on-box, so no S3 or other
services are involved. The deploy script prints the bundle's exact monthly
price before creating anything (it defaults to the cheapest Linux bundle
with ≥ 1 GB RAM — needed for the build).

### One-time IAM setup

Attach `deploy/iam-lightsail-policy.json` (`lightsail:*`) as an inline policy
to the deploying IAM user: IAM console → Users → (deploy user) →
Add permissions → Create inline policy → JSON. Lightsail is a walled garden —
this grant can't create EC2/S3/etc. resources outside it.

### Deploy

The app is built locally and shipped as a tarball — nothing compiles on the
instance (a 1 GB instance cannot survive `next build`; the first attempt
proved it). Three steps:

```bash
# 1. Build + package the standalone bundle (once per code change)
npm run build
# stage .next/standalone + .next/static + public + a seeded empty SQLite db
# into a directory and tar it up as beaten-bundle.tar.gz
# (deploy/build-bundle.sh does the same staging for EB and is easy to adapt)

# 2. Upload to a Lightsail bucket with public read (only needed during deploys)
aws lightsail create-bucket --bucket-name beaten-deploy-artifacts --bundle-id small_1_0
aws lightsail update-bucket --bucket-name beaten-deploy-artifacts \
  --access-rules getObject=public,allowPublicOverrides=false
# upload with the S3 API using keys from create-bucket-access-key
aws s3 cp beaten-bundle.tar.gz s3://beaten-deploy-artifacts/

# 3. Create the instance
BUNDLE_URL=https://beaten-deploy-artifacts.s3.us-east-1.amazonaws.com/beaten-bundle.tar.gz \
  ./deploy/deploy-lightsail.sh
```

Creates instance `beaten-prod` (Ubuntu 24.04, Node 22), opens port 80,
attaches static IP `beaten-ip` (free while attached). Setup takes ~3 min.
Delete the bucket after deploying (`aws lightsail delete-bucket
--bucket-name beaten-deploy-artifacts --force-delete`) — it's only needed
while an instance is downloading the bundle.

To deploy with live IGDB search enabled from the start, also export
`TWITCH_CLIENT_ID=xxx TWITCH_CLIENT_SECRET=yyy IGDB_MOCK=0`.

### Update to latest code

Rebuild + re-upload the bundle (steps 1–2 above), then from the Lightsail
**browser SSH console**:

```bash
sudo /usr/local/bin/beaten-install https://beaten-deploy-artifacts.s3.us-east-1.amazonaws.com/beaten-bundle.tar.gz
```

The SQLite database lives in `/opt/beaten/data` and is
never touched by updates. (Env changes: edit `/etc/beaten.env`, then
`sudo systemctl restart beaten`.)

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

- Both options serve plain HTTP. For HTTPS on Lightsail, point a domain at
  the static IP and run `certbot --nginx` from the SSH console (Let's Encrypt,
  free), or use a Cloudflare free-tier proxy in front.
- `AUTH_SECRET` is generated at deploy time and lives in `/etc/beaten.env`
  (Lightsail) or EB environment properties. Rotating it signs everyone out.
- SQLite is fine for one user or a handful; move to Postgres (RDS/Lightsail
  managed DB) if the site ever needs more than one instance.
