# The Loams harness

Scripts that install the pinned Loams release and start it for the conformance gate. Every
listener is on loopback. Never point the gate at a public endpoint.

| Script | What |
|---|---|
| `install-loams.sh` | Downloads `loams_<v>_amd64.deb`, `loams-compose-<v>.tar.gz` and `SHA256SUMS` from the `v<v>` release, checks each against `SHA256SUMS` **and** `../pins.json`, unpacks the `.deb` (or installs it as root) and the compose tarball. Exports `LOAMS_BIN` and `LOAMS_COMPOSE_DIR`. |
| `start-loams.sh [--auth]` | `loams dev` with Qdrant on `127.0.0.1:6333`, Elasticsearch on `127.0.0.1:9200`, Durable on `127.0.0.1:8001`. `--auth` sets `LOAMS_AUTH_MODE=apikey`, mints a throwaway key with `loams auth new-key --append`, and exports it as `LOAMS_API_KEY` (masked in Actions). Exports `LOAMS_QDRANT_URL`, `LOAMS_ES_URL`, `LOAMS_URL`. |
| `start-postgres.sh` | The release's `loams-postgres-dev` stack (its `pg-bootstrap` creates the tenant and timeline), waits for `compute1` on `127.0.0.1:55433`, exports `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` and `DB_URL` (the variables Mastra's pg suites read). |
| `stop.sh [--logs]` | Stops both; `--logs` prints the last 200 lines of each log first. |
| `test.sh` | `start_loams_refuses_bad_checksum`. |

In GitHub Actions the exports go to `$GITHUB_ENV`, so later steps see them.

## Running the gate locally

Against your own `loams dev`, or a local build:

```sh
export LOAMS_HARNESS_DIR="$PWD/.harness"               # data, logs, keys (default $RUNNER_TEMP)
export LOAMS_BIN=/path/to/loams                        # skip install-loams.sh
test/conformance/loams/start-loams.sh --auth
```

If the default ports are taken, move every listener to free loopback ports:

```sh
export LOAMS_QDRANT_LISTEN=127.0.0.1:36333 LOAMS_ES_LISTEN=127.0.0.1:39200 \
  LOAMS_DURABLE_LISTEN=127.0.0.1:38001 LOAMS_LISTEN=127.0.0.1:38080 \
  LOAMS_DEV_ARGS="--qdrant-grpc-listen 127.0.0.1:36334 --flight-sql-listen 127.0.0.1:38082 --live-listen 127.0.0.1:37710"
```

To use a Loams Postgres you already run, set `LOAMS_PG_PORT` (and `LOAMS_PG_HOST`,
`LOAMS_PG_USER`, `LOAMS_PG_PASSWORD`, `LOAMS_PG_DB` if they differ from `127.0.0.1`,
`cloud_admin`, `cloud_admin`, `postgres`); `start-postgres.sh` then only waits and exports.
Otherwise it runs the release's compose stack under the project `loams-mastra-conformance`
(Docker, or Podman with `DOCKER_HOST` pointing at its socket); `stop.sh` takes that project
down with its volumes, and nothing else.
