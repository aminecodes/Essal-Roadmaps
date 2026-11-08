# Essal Roadmaps pooled deployment

Railway project: **Essal Roadmaps** (`2e208709-82d6-40a4-a200-05d673205f5d`).
Production environment: `9f5716c6-6044-4373-a580-c32f2451a261`.

The project owns its application, PostgreSQL server, PgBouncer transaction pooler,
and storage bucket. It is independent of the Essal Project and Essal Talent
Railway projects. All services are in the Amsterdam region.

`product.essal.cloud` serves the product directory. `workspaces.json` declares
the three isolated workspace hostnames. The Access domain connects directly to
Railway; Project and Talent use the Cloudflare Worker in `../edge/roadmaps` to
forward their signed hostname and client IP to the Railway origin. This uses
the app's existing `saas-edge-host` protocol and avoids the Railway plan's
two-domain limit. Cookies and authenticated responses are not cached.

Each workspace has its own database, login role, derived application secret,
identity stamp and secret canary. The control registry contains sealed database
credentials. PostgreSQL CONNECT is revoked from PUBLIC on workspace databases.
Request pools use PgBouncer; migrations and background session consumers use
PostgreSQL directly. Shared storage keys are scoped by the verified workspace.

The application runs `QUACKBACK_TENANCY=pooled`, `QUACKBACK_ROLE=all` and
`SKIP_MIGRATIONS=true`. The control database is configured through
`QUACKBACK_CONTROL_DATABASE_URL`; **DATABASE_URL must remain unset**.
Startup catch-up and the fleet migrator handle workspace migrations; the normal
single-database container migration must remain disabled.

## Provisioning

`control-schema.sql` initializes this small operator-managed registry.
`apps/web/scripts/provision-roadmaps.ts` creates databases, applies the bundled
migrations, seeds the initial owner and feedback board, validates registry
records using the runtime contract, and registers each hostname. It refuses
existing unregistered databases unless their workspace stamp matches.

Run the provisioner from the repository root using Bun and a private deployment
JSON path. That file contains the temporary public control URL, owner email,
initial admin password, bucket connection details and application variables,
including the fleet root. Never commit it. It records the generated PgBouncer
DATABASE_URLS credentials after provisioning; apply those to the pooler service.
Existing registered workspaces retain their credentials and content.

The application service references the Railway bucket variables for S3 secrets.
The fleet root and initial administrator credentials are kept outside the repo.
The initial admin password should be replaced through account settings.

## Deployment

The Essal fork supports `QUACKBACK_HIDE_POWERED_BY=true` for self-hosted
workspaces. Set this on the Railway application service to hide the shared
portal, widget and email attribution. Railway retains the variable across
redeployments. Preserve the small `shouldShowPoweredBy` override and its tests
when merging upstream; replacing the fork with an unmodified upstream image
will remove support for the setting. Run the powered-by tests before upgrading.

The application Dockerfile is `apps/web/Dockerfile`, with the repository root as
the build context. Keep `apps/web/src/lib/build` in uploaded source: despite the
name these are required Vite plugins, not generated build output. The gitignore
exceptions and `.railwayignore` preserve them.

The verified deployment used a clean source snapshot and `railway up
--no-gitignore` from that snapshot directory, with the explicit project,
environment and application service IDs. Never upload dependencies or local
environment files when using this flag. The Dockerfile normalizes shell
entrypoint line endings before making it executable.

Public database access was enabled only for initial provisioning and removed
after verification. To provision more workspaces from a local terminal,
temporarily create a new database TCP proxy and update the private deployment
file's `publicControlUrl`, then remove the proxy when finished. Add new apps to
the manifest, directory links, and edge allowlist/domain configuration together.

The edge Worker uses the cf CLI:

```powershell
cd deploy/edge/roadmaps
npm ci
bun build.ts
cf deploy --prebuilt --mode production --secrets-file <private-edge-secrets.json>
```

Its `EDGE_SECRET` must equal the application `QUACKBACK_SAAS_EDGE_SECRET`.
Verify Railway deployment SUCCESS, readiness, the directory, each workspace's
public configuration, and admin login after deploying.
