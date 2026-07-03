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

```bash
./deploy/deploy-lightsail.sh
```

Creates instance `beaten-prod` (Ubuntu 24.04, Node 22), opens port 80,
attaches static IP `beaten-ip` (free while attached), waits for the app,
and prints `http://<ip>`. First boot takes ~5–10 minutes (installs Node,
builds the app).

To deploy with live IGDB search enabled from the start:

```bash
TWITCH_CLIENT_ID=xxx TWITCH_CLIENT_SECRET=yyy IGDB_MOCK=0 ./deploy/deploy-lightsail.sh
```

### Update to latest code

From the Lightsail **browser SSH console** (or any SSH session):

```bash
sudo /opt/beaten/src/deploy/lightsail/update.sh
```

(Env changes: edit `/etc/beaten.env`, then `sudo systemctl restart beaten`.)

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
