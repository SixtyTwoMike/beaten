# Sourced by push-lightsail.sh and admin.sh. Fetches short-lived SSH
# credentials for the instance from `aws lightsail get-instance-access-details`
# into a temp dir (deleted on exit) and sets TARGET and SSH_OPTS.

NAME="${LIGHTSAIL_NAME:-beaten-prod}"
export AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-$(aws configure get region || echo us-east-1)}"

KEYDIR=$(mktemp -d)
trap 'rm -rf "$KEYDIR"' EXIT
ACCESS=$(aws lightsail get-instance-access-details --instance-name "$NAME" \
  --protocol ssh --output json)
node -e '
  const a = JSON.parse(require("fs").readFileSync(0, "utf8")).accessDetails;
  const fs = require("fs"), dir = process.argv[1];
  fs.writeFileSync(`${dir}/key`, a.privateKey, { mode: 0o600 });
  fs.writeFileSync(`${dir}/key-cert.pub`, a.certKey);
  fs.writeFileSync(`${dir}/known_hosts`,
    a.hostKeys.map((k) => `${a.ipAddress} ${k.algorithm} ${k.publicKey}`).join("\n") + "\n");
  fs.writeFileSync(`${dir}/target`, `${a.username}@${a.ipAddress}`);
' "$KEYDIR" <<<"$ACCESS"
unset ACCESS
TARGET=$(cat "$KEYDIR/target")
SSH_OPTS=(-i "$KEYDIR/key" -o CertificateFile="$KEYDIR/key-cert.pub"
  -o UserKnownHostsFile="$KEYDIR/known_hosts" -o StrictHostKeyChecking=yes
  -o BatchMode=yes -o ConnectTimeout=10)
