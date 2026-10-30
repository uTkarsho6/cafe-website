#!/usr/bin/env bash
# Starts a throwaway local Postgres for the integration tests (never the team's Supabase projects).
# Usage: npm run test:db:up | test:db:reset (migrate + seed) | test:db:reco | test:db:down
# The password below is a local-only, non-secret test value; the container listens on 127.0.0.1 only.
set -euo pipefail
NAME=zorko-test-db
case "${1:-up}" in
  up)
    if [ -z "$(docker ps -q -f name=^${NAME}$)" ]; then
      docker rm -f "$NAME" >/dev/null 2>&1 || true
      docker run -d --name "$NAME" -p 127.0.0.1:54329:5432 \
        -e POSTGRES_USER=zorko_test -e POSTGRES_PASSWORD=zorko_test -e POSTGRES_DB=zorko_test \
        postgres:17-alpine >/dev/null
    fi
    # pg_isready can succeed during the image's init step, so wait for a real query to work.
    for _ in $(seq 1 60); do
      docker exec "$NAME" psql -q -U zorko_test -d zorko_test -c 'SELECT 1' >/dev/null 2>&1 && break
      sleep 1
    done
    # Recreate the Supabase API roles so the RLS migration and the RLS tests behave as on Supabase.
    docker exec "$NAME" psql -q -U zorko_test -d zorko_test -c "
      DO \$\$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
      END \$\$;
      GRANT USAGE ON SCHEMA public TO anon, authenticated;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;"
    echo "Test database ready on 127.0.0.1:54329"
    ;;
  reset)
    # Fresh container + migrations + demo seed. The URL is fixed here on purpose so this can never
    # point at a Supabase project. Recreating the container replaces `prisma migrate reset`.
    docker rm -f "$NAME" >/dev/null 2>&1 || true
    "$0" up
    export DIRECT_URL="postgresql://zorko_test:zorko_test@127.0.0.1:54329/zorko_test"
    export DATABASE_URL="$DIRECT_URL"
    npx prisma migrate deploy >/dev/null
    SEED_DATASET=test ALLOW_DEMO_SEED=true npx tsx prisma/seed.ts
    ;;
  reco)
    # Phase R4: give the E2E database a trained recommender, as on the dev project. Meal roles for
    # the test categories, rule-based flavour tags, demo feedback, one training run, switched on.
    export DIRECT_URL="postgresql://zorko_test:zorko_test@127.0.0.1:54329/zorko_test"
    export DATABASE_URL="$DIRECT_URL"
    docker exec "$NAME" psql -q -U zorko_test -d zorko_test -c "
      UPDATE \"MenuCategory\" SET \"mealRole\" = 'SIDE' WHERE slug = 'snacks';
      UPDATE \"MenuCategory\" SET \"mealRole\" = 'DRINK' WHERE slug = 'beverages';
      UPDATE \"MenuCategory\" SET \"mealRole\" = 'DESSERT' WHERE slug = 'desserts';"
    npx tsx prisma/reco-tags.ts >/dev/null
    npx tsx prisma/reco-generate.ts --replace >/dev/null
    npx tsx prisma/reco-train.ts
    docker exec "$NAME" psql -q -U zorko_test -d zorko_test -c "UPDATE \"RecoSettings\" SET enabled = true;"
    ;;
  down) docker rm -f "$NAME" >/dev/null && echo "Test database removed" ;;
esac
