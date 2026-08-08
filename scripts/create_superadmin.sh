#!/usr/bin/env bash
set -euo pipefail

# Usage: ./scripts/create_superadmin.sh [username] [password]
# Creates a new admin user in the auth DB by hashing the password inside
# the running `auth-node-service` container and inserting via the
# postgres container. Requires docker compose to be running.

USERNAME=${1:-superadmin}
PASSWORD=${2:-Admin1234}
NAME=${3:-"Super Admin"}

echo "Creating super admin user '${USERNAME}' (name: ${NAME})"

# Generate bcrypt hash inside auth-node-service (uses the container's bcrypt)
HASH=$(docker compose exec -T auth-node-service node -e "const bcrypt=require('bcrypt'); (async()=>console.log(await bcrypt.hash(process.argv[1],10)))()" -- "${PASSWORD}")

if [ -z "$HASH" ]; then
  echo "Failed to generate password hash" >&2
  exit 1
fi

ID="USR-$(date +%s)"

PERMISSIONS='{"viewDashboard":true,"manageVoucher":true,"manageBilling":true,"manageReseller":true,"managePppoe":true,"manageHotspot":true,"viewReport":true,"manageSystem":true}'

TEMPLATE=$(cat <<'SQL'
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM users WHERE username = '__USERNAME__') THEN
    RAISE NOTICE 'user % already exists, aborting', '__USERNAME__';
  ELSE
    INSERT INTO users (id, username, password, name, role, active, "allowedSessions", permissions, "createdAt", note)
    VALUES (
      '__ID__',
      '__USERNAME__',
      '__HASH__',
      '__NAME__',
      'admin',
      true,
      '[]'::json,
      '__PERMISSIONS__'::json,
      now(),
      'Created via scripts/create_superadmin.sh'
    );
    RAISE NOTICE 'created user % with id %', '__USERNAME__', '__ID__';
  END IF;
END
$$;
SQL
)

# Substitute placeholders safely (heredoc used single-quoted delimiter to avoid expansion)
SQL=${TEMPLATE//__ID__/$ID}
SQL=${SQL//__USERNAME__/$USERNAME}
# Wrap hash & name in single quotes for SQL literal safety
SQL=${SQL//__HASH__/$(printf "%s" "$HASH" | sed "s/'/''/g")}
SQL=${SQL//__NAME__/$(printf "%s" "$NAME" | sed "s/'/''/g")}
SQL=${SQL//__PERMISSIONS__/$(printf "%s" "$PERMISSIONS" | sed "s/'/''/g")}

echo "Inserting user into db_auth..."
docker compose exec -T postgres-db psql -U ${POSTGRES_USER:-admin_mikrotik} -d db_auth -c "$SQL"

echo "Done. You can login as '${USERNAME}' with the provided password." 
