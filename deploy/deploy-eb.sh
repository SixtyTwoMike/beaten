#!/usr/bin/env bash
# Deploys the newest bundle from deploy/out/ to Elastic Beanstalk.
# Idempotent: creates the app/environment on first run, updates afterwards.
#
# Requires the calling IAM identity to have Elastic Beanstalk deploy
# permissions — the AWS-managed policy "AdministratorAccess-AWSElasticBeanstalk"
# covers everything (EB, its S3 bucket, CloudFormation, EC2, and the EB roles).
set -euo pipefail
cd "$(dirname "$0")/.."

APP=beaten
ENV=beaten-prod
REGION="${AWS_DEFAULT_REGION:-us-east-1}"
INSTANCE_TYPE="${EB_INSTANCE_TYPE:-t3.micro}"

ZIP=$(ls -t deploy/out/beaten-eb-*.zip 2>/dev/null | head -1) || true
[ -n "${ZIP:-}" ] || { echo "No bundle found — run deploy/build-bundle.sh first"; exit 1; }
VERSION=$(basename "$ZIP" .zip)
echo "==> deploying $ZIP as version $VERSION"

echo "==> ensuring instance profile"
if ! aws iam get-instance-profile --instance-profile-name aws-elasticbeanstalk-ec2-role >/dev/null 2>&1; then
  aws iam create-role --role-name aws-elasticbeanstalk-ec2-role \
    --assume-role-policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"ec2.amazonaws.com"},"Action":"sts:AssumeRole"}]}'
  aws iam attach-role-policy --role-name aws-elasticbeanstalk-ec2-role \
    --policy-arn arn:aws:iam::aws:policy/AWSElasticBeanstalkWebTier
  aws iam create-instance-profile --instance-profile-name aws-elasticbeanstalk-ec2-role
  aws iam add-role-to-instance-profile --instance-profile-name aws-elasticbeanstalk-ec2-role \
    --role-name aws-elasticbeanstalk-ec2-role
  sleep 10 # IAM propagation
fi

echo "==> uploading bundle"
BUCKET=$(aws elasticbeanstalk create-storage-location --query S3Bucket --output text)
aws s3 cp "$ZIP" "s3://$BUCKET/$APP/$VERSION.zip" --no-progress

echo "==> application + version"
aws elasticbeanstalk describe-applications --application-names "$APP" \
  --query 'Applications[0].ApplicationName' --output text 2>/dev/null | grep -q "$APP" ||
  aws elasticbeanstalk create-application --application-name "$APP" \
    --description "Beaten — game tracking portal"
aws elasticbeanstalk create-application-version --application-name "$APP" \
  --version-label "$VERSION" \
  --source-bundle S3Bucket="$BUCKET",S3Key="$APP/$VERSION.zip" --process

STACK=$(aws elasticbeanstalk list-available-solution-stacks \
  --query "SolutionStacks[?contains(@, 'running Node.js 22')] | [0]" --output text)
echo "==> platform: $STACK"

EXISTS=$(aws elasticbeanstalk describe-environments --application-name "$APP" \
  --environment-names "$ENV" --no-include-deleted \
  --query 'Environments[0].Status' --output text 2>/dev/null || echo None)

if [ "$EXISTS" = "None" ] || [ "$EXISTS" = "null" ]; then
  echo "==> creating environment $ENV (single instance, $INSTANCE_TYPE)"
  AUTH_SECRET=$(openssl rand -base64 32)
  aws elasticbeanstalk create-environment \
    --application-name "$APP" --environment-name "$ENV" \
    --solution-stack-name "$STACK" --version-label "$VERSION" \
    --option-settings \
      Namespace=aws:elasticbeanstalk:environment,OptionName=EnvironmentType,Value=SingleInstance \
      Namespace=aws:autoscaling:launchconfiguration,OptionName=InstanceType,Value="$INSTANCE_TYPE" \
      Namespace=aws:autoscaling:launchconfiguration,OptionName=IamInstanceProfile,Value=aws-elasticbeanstalk-ec2-role \
      Namespace=aws:elasticbeanstalk:application:environment,OptionName=DATABASE_URL,Value="file:/var/beaten-data/beaten.db" \
      Namespace=aws:elasticbeanstalk:application:environment,OptionName=AUTH_SECRET,Value="$AUTH_SECRET" \
      Namespace=aws:elasticbeanstalk:application:environment,OptionName=AUTH_TRUST_HOST,Value=true \
      Namespace=aws:elasticbeanstalk:application:environment,OptionName=IGDB_MOCK,Value="${IGDB_MOCK:-1}" \
      Namespace=aws:elasticbeanstalk:application:environment,OptionName=TWITCH_CLIENT_ID,Value="${TWITCH_CLIENT_ID:-}" \
      Namespace=aws:elasticbeanstalk:application:environment,OptionName=TWITCH_CLIENT_SECRET,Value="${TWITCH_CLIENT_SECRET:-}"
else
  echo "==> updating environment $ENV to $VERSION"
  aws elasticbeanstalk update-environment \
    --application-name "$APP" --environment-name "$ENV" --version-label "$VERSION"
fi

echo "==> waiting for environment to become Ready"
for i in $(seq 1 60); do
  read -r STATUS HEALTH CNAME <<<"$(aws elasticbeanstalk describe-environments \
    --application-name "$APP" --environment-names "$ENV" --no-include-deleted \
    --query 'Environments[0].[Status,Health,CNAME]' --output text)"
  echo "   $STATUS / $HEALTH"
  if [ "$STATUS" = "Ready" ]; then
    echo ""
    echo "Deployed: http://$CNAME"
    exit 0
  fi
  sleep 20
done
echo "Timed out waiting for environment — check the EB console" >&2
exit 1
