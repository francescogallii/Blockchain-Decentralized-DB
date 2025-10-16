#!/bin/bash
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  CREATE ROLE $REPL_USER WITH REPLICATION LOGIN PASSWORD '$REPL_PASSWORD';
EOSQL

echo "host replication $REPL_USER all md5" >> "$PGDATA/pg_hba.conf"