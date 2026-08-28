# Demo stack

A stripped-down, self-contained stack for running a public demo of filestore:
backend + frontend + a bundled MinIO (no external MinIO server needed), with
fixed `demo` / `demo12345` credentials, and everything wiped on a schedule so
it never accumulates other people's uploads.

**Not for real data** — anything uploaded to the demo is deleted on every
reset.

## Run it

```bash
cd demo
docker compose -f docker-compose.demo.yml up -d
```

The app is served on port `8082`. Put a reverse proxy with TLS in front of it
for a real public URL.

## Automatic reset

`reset.sh` tears the stack down with `-v` (dropping the MinIO and app-database
volumes) and brings it back up clean.

To run it on a schedule, install the provided systemd units (adjust the path
in `filestore-demo-reset.service` first, and the interval in
`filestore-demo-reset.timer` — defaults to every 6 hours):

```bash
sudo cp filestore-demo-reset.service filestore-demo-reset.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now filestore-demo-reset.timer
```

Or, with cron, to reset every 6 hours:

```
0 */6 * * * /opt/filestore/demo/reset.sh >> /var/log/filestore-demo-reset.log 2>&1
```
