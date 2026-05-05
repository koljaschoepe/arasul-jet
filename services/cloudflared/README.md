# Cloudflared (Cloudflare Tunnel)

External Cloudflare Tunnel for exposing the Arasul appliance to the internet over HTTPS without opening inbound ports on the customer's firewall. **Config-only directory** — the running container uses the upstream `cloudflare/cloudflared` image; we don't build or maintain a Dockerfile.

## Overview

| Property       | Value                                                                                 |
| -------------- | ------------------------------------------------------------------------------------- |
| Image          | `cloudflare/cloudflared:2025.2.1` (pinned)                                            |
| Compose entry  | [`compose/compose.external.yaml`](../../compose/compose.external.yaml)                |
| Activation     | Optional — only enabled when `compose.external.yaml` is included in the compose chain |
| Customer scope | Customers configure their own tunnel; we ship a template                              |

## Components

```
cloudflared/
├── config.yml.template            Tunnel config template (placeholders for customer's tunnel ID + hostname)
└── docker-compose.override.yml    Optional override for advanced setups
```

## How it's wired up

1. Operator runs `cloudflared tunnel create arasul-<customer>` on a workstation that has Cloudflare credentials, downloading the resulting tunnel-credentials JSON.
2. The credentials JSON is placed under `config/secrets/cloudflared/<tunnel-id>.json` on the appliance.
3. `config.yml.template` is filled in with the tunnel ID and the hostname mapping (e.g. `arasul.<customer>.example.com` → `https://traefik:443`) and saved as `config/cloudflared/config.yml`.
4. `compose.external.yaml` is included in the compose chain (typically by `./arasul bootstrap` when the operator opted into a public tunnel).
5. Cloudflared boots, registers with the tunnel, and starts forwarding HTTPS traffic through Traefik.

## When to enable it

Use Cloudflared only when the customer wants public internet access without firewall changes. For LAN-only deployments (the default), skip it — the appliance is reachable via mDNS (`arasul.local`) and Tailscale.

## Updates

Pin the image tag in `compose.external.yaml` (do not use `latest`). Cloudflared releases roughly monthly; bump the tag on a maintenance window after testing on a staging tunnel.
