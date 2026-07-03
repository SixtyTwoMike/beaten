# Deploying Beaten to AWS

The app deploys to **Elastic Beanstalk** as a single `t3.micro` instance
(free-tier eligible) running the Node.js 22 platform. SQLite lives at
`/var/beaten-data/beaten.db` on the instance — outside the app directory, so
it survives redeploys (it will not survive instance replacement; move to RDS
Postgres when that matters).

## One-time: IAM permissions

The deploying IAM identity needs Elastic Beanstalk deploy rights. The
simplest correct option is the AWS-managed policy:

```
AdministratorAccess-AWSElasticBeanstalk
```

Attach it in the IAM console → Users → (your deploy user) → Add permissions →
Attach policies directly. It scopes EC2/S3/CloudFormation/IAM access to the
resources Elastic Beanstalk manages.

> Status quo: the `Claude` IAM user in this account currently has only
> `elasticbeanstalk:Describe*` — enough to watch, not enough to deploy.

## Deploy

```bash
./deploy/build-bundle.sh   # next build (standalone) → deploy/out/beaten-eb-<sha>.zip
./deploy/deploy-eb.sh      # create/update the EB app + environment, prints the URL
```

`deploy-eb.sh` is idempotent: first run creates application `beaten` and
environment `beaten-prod`; later runs upload a new version and update the
environment in place (the SQLite data dir is preserved).

Environment variables consumed at deploy time (all optional):

| Variable | Effect |
| --- | --- |
| `TWITCH_CLIENT_ID` / `TWITCH_CLIENT_SECRET` | Enables live IGDB search on the deployed site |
| `IGDB_MOCK` | Defaults to `1` (sample catalog) when no Twitch creds are exported |
| `EB_INSTANCE_TYPE` | Defaults to `t3.micro` |

To change env vars later:

```bash
aws elasticbeanstalk update-environment --environment-name beaten-prod \
  --option-settings Namespace=aws:elasticbeanstalk:application:environment,OptionName=IGDB_MOCK,Value=0 \
                    Namespace=aws:elasticbeanstalk:application:environment,OptionName=TWITCH_CLIENT_ID,Value=xxx \
                    Namespace=aws:elasticbeanstalk:application:environment,OptionName=TWITCH_CLIENT_SECRET,Value=yyy
```

## Teardown

```bash
aws elasticbeanstalk terminate-environment --environment-name beaten-prod
aws elasticbeanstalk delete-application --application-name beaten
```

## Notes / future

- The site is served over plain HTTP on the EB CNAME. For HTTPS, put the
  environment behind a load balancer with an ACM cert, or front it with
  CloudFront — both are follow-up work.
- `AUTH_SECRET` is generated on first deploy and stored as an EB environment
  property. Rotate it from the EB console if needed (this signs sessions, so
  rotating logs everyone out).
- Moving to Postgres later: change the Prisma datasource provider, set
  `DATABASE_URL` to the RDS URL, and drop the `.platform` SQLite hook.
