/** Provision the small operator-managed fleet. Secrets are read from a private
 * local JSON file, never from the manifest or source control. Run with Bun. */
import postgres from 'postgres'
import { randomBytes, randomUUID } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { runMigrations } from '../../../packages/db/src/migrate-runtime'
import {
  deriveWorkspaceSecret,
  sealWorkspaceSecret,
  sealSecretKeyCanary,
} from '../src/lib/server/workspaces/vendor/fleet-secrets'
import { validateWorkspaceRecord } from '../src/lib/server/workspaces/vendor/contract'
import { hashPassword } from 'better-auth/crypto'
import { fromUuid } from '@quackback/ids'

const privatePath = process.argv[2]
if (!privatePath) throw new Error('Supply the private deployment JSON path')
const cfg = JSON.parse(await readFile(privatePath, 'utf8'))
const manifest = JSON.parse(await readFile('deploy/pooled/workspaces.json', 'utf8')) as Array<{
  slug: string
  name: string
  hostname: string
}>
const control = postgres(cfg.publicControlUrl, { max: 1, connect_timeout: 20 })
const quote = (name: string) => '"' + name.replaceAll('"', '""') + '"'
const literal = (value: string) => "'" + value.replaceAll("'", "''") + "'"
try {
  await control.unsafe(await readFile('deploy/pooled/control-schema.sql', 'utf8'))
  await Promise.all(
    manifest.map(async (app) => {
      if (!/^[a-z][a-z0-9-]*$/.test(app.slug) || !/^[a-z0-9.-]+$/.test(app.hostname))
        throw new Error('Invalid manifest')
      const key = `essal-${app.slug}`,
        dbName = `roadmaps_${app.slug}`,
        role = dbName
      const existing =
        await control`SELECT workspace_key FROM cp_workspace_registry WHERE workspace_key = ${key}`
      if (existing.length) {
        console.log(`${key}: already provisioned; preserving credentials`)
        return
      }
      const dbExists = await control`SELECT 1 FROM pg_database WHERE datname = ${dbName}`
      const password = randomBytes(32).toString('hex')
      const adminUrl = new URL(cfg.publicControlUrl)
      adminUrl.pathname = '/' + dbName
      if (dbExists.length) {
        const inspect = postgres(adminUrl.toString(), { max: 1 })
        try {
          const identity = await inspect`SELECT cloud_workspace_key FROM settings LIMIT 2`
          if (identity.length !== 1 || identity[0].cloud_workspace_key !== key)
            throw new Error(
              `${dbName} has no matching provisioning stamp; manual inspection required`
            )
        } finally {
          await inspect.end()
        }
        await control.unsafe(`ALTER ROLE ${quote(role)} PASSWORD ${literal(password)}`)
      } else {
        await control.unsafe(`CREATE ROLE ${quote(role)} LOGIN PASSWORD ${literal(password)}`)
        await control.unsafe(`CREATE DATABASE ${quote(dbName)} OWNER ${quote(role)}`)
        await control.unsafe(`REVOKE CONNECT ON DATABASE ${quote(dbName)} FROM PUBLIC`)
      }
      const admin = postgres(adminUrl.toString(), { max: 1 })
      await admin.unsafe(
        'CREATE EXTENSION IF NOT EXISTS vector; CREATE EXTENSION IF NOT EXISTS pg_trgm'
      )
      await admin.end()
      const publicUrl = new URL(adminUrl)
      publicUrl.username = role
      publicUrl.password = password
      console.log(`${key}: applying bundled migrations`)
      await runMigrations(publicUrl.toString(), {
        migrationsFolder: 'packages/db/drizzle',
        onPending: () => console.log(`${key}: migrating pending schema`),
      })
      const sql = postgres(publicUrl.toString(), { max: 1 })
      try {
        const oldSettings = await sql`SELECT id FROM settings LIMIT 1`
        const oldUser = await sql`SELECT id FROM "user" WHERE email=${cfg.ownerEmail} LIMIT 1`
        const id = oldSettings[0]?.id ?? randomUUID(),
          userId = oldUser[0]?.id ?? randomUUID()
        const oldPrincipal = await sql`SELECT id FROM principal WHERE user_id=${userId} LIMIT 1`
        const principalId = oldPrincipal[0]?.id ?? randomUUID()
        const target = { generation: 1, workspaceKey: key, purpose: 'app-secrets' as const }
        const secretKey = deriveWorkspaceSecret(cfg.variables.QUACKBACK_FLEET_ROOT_KEY, target)
        const setup = {
          version: 2,
          ownerPrincipalId: fromUuid('principal', principalId),
          steps: {
            core: true,
            workspace: true,
            startingPoint: {
              outcome: 'product_feedback',
              resourceType: 'board',
              source: 'existing',
              resolution: 'created',
              completedAt: new Date().toISOString(),
            },
          },
        }
        await sql`INSERT INTO settings (id,name,slug,created_at,setup_state,cloud_workspace_key,cloud_secret_canary) VALUES (${id},${app.name},${app.slug},now(),${JSON.stringify(setup)},${key},${sealSecretKeyCanary(secretKey, key)}) ON CONFLICT (id) DO NOTHING`
        await sql`INSERT INTO "user" (id,name,email,email_verified,created_at,updated_at) VALUES (${userId},'Essal Admin',${cfg.ownerEmail},true,now(),now()) ON CONFLICT (id) DO NOTHING`
        await sql`INSERT INTO principal (id,user_id,role,type,display_name,created_at) VALUES (${principalId},${userId},'admin','user','Essal Admin',now()) ON CONFLICT (id) DO NOTHING`
        const oldAccount =
          await sql`SELECT id FROM account WHERE user_id=${userId} AND provider_id='credential' LIMIT 1`
        if (!oldAccount.length)
          await sql`INSERT INTO account (id,account_id,provider_id,user_id,password,created_at,updated_at) VALUES (${randomUUID()},${fromUuid('user', userId)},'credential',${userId},${await hashPassword(cfg.adminPassword)},now(),now())`
        await sql`INSERT INTO principal_role_assignments (id,principal_id,role_id) SELECT ${randomUUID()},${principalId}, id FROM roles WHERE key='owner' ON CONFLICT DO NOTHING`
        await sql`INSERT INTO boards (id,slug,name,description,created_at,updated_at) VALUES (${randomUUID()},'feedback','Feedback',${`Ideas and suggestions for ${app.name}.`},now(),now()) ON CONFLICT (slug) DO NOTHING`
        await sql`INSERT INTO roadmaps (id,slug,name,created_at,updated_at) VALUES (${randomUUID()},'roadmap','Roadmap',now(),now()) ON CONFLICT (slug) DO NOTHING`
        const [physical] =
          await sql`SELECT oid::text AS oid FROM pg_database WHERE datname = current_database()`
        const [ledger] =
          await sql`SELECT max(created_at)::text AS version, count(*)::int AS count FROM drizzle.__drizzle_migrations`
        const dsn = `postgresql://${role}@roadmaps-postgres.railway.internal:5432/${dbName}`
        const pooledDsn = `postgresql://${role}@roadmaps-pooler.railway.internal:5432/${dbName}`
        const credentialRef = `sealed+aead://v1/${key}/db/${sealWorkspaceSecret(cfg.variables.QUACKBACK_FLEET_ROOT_KEY, { generation: 1, workspaceKey: key, purpose: 'db' }, password)}`
        const storage = {
          provider: 'r2',
          bucket: cfg.bucketName,
          endpoint: cfg.bucketEndpoint,
          region: 'auto',
          forcePathStyle: false,
          publicUrl: `https://${app.hostname}`,
        }
        const stamp = new Date().toISOString()
        const record = {
          contractVersion: 1,
          workspaceKey: key,
          revision: 1,
          routing: {
            primaryHostname: app.hostname,
            hostnames: [app.hostname],
            baseUrl: `https://${app.hostname}`,
          },
          database: { pooledUrl: pooledDsn, directUrl: dsn, name: dbName, role, credentialRef },
          fingerprint: {
            expectedWorkspaceKey: key,
            expectedSelfReportedWorkspaceId: id,
            stampedAt: stamp,
          },
          secrets: { appSecretsRef: `derived+hkdf://v1/${key}/app-secrets` },
          storage,
          email: { from: 'Essal <noreply@essal.cloud>', mailSlug: app.slug },
          features: { aiEnabled: false },
        }
        const valid = validateWorkspaceRecord(record)
        if (!valid.ok) throw new Error(JSON.stringify(valid.problems))
        await control.begin(async (tx) => {
          await tx`INSERT INTO cp_workspace_registry (workspace_key,state,primary_hostname,base_url,db_pooled_url,db_direct_url,db_name,db_role,db_credential_ref,app_secrets_ref,workspace_id,fingerprint_stamped_at,storage,email_from,mail_slug,pg_database_oid,pg_cluster_id) VALUES (${key},'active',${app.hostname},${record.routing.baseUrl},${pooledDsn},${dsn},${dbName},${role},${credentialRef},${record.secrets.appSecretsRef},${id},${stamp},${JSON.stringify(storage)}::jsonb,${record.email.from},${app.slug},${physical.oid},'essal-roadmaps')`
          await tx`INSERT INTO cp_workspace_hostnames (hostname,workspace_key,kind) VALUES (${app.hostname},${key},'custom')`
          await tx`INSERT INTO cp_workspace_activity (workspace_key,last_active_at) VALUES (${key},now())`
          await tx`INSERT INTO cp_workspace_schema_state (workspace_key,target_version,current_version,applied_count,postconditions_ok,status,last_verified_at) VALUES (${key},${ledger.version},${ledger.version},${ledger.count},true,'succeeded',now())`
        })
        cfg.poolerDatabaseUrls ??= []
        cfg.poolerDatabaseUrls = cfg.poolerDatabaseUrls.filter(
          (url: string) => !url.endsWith(`/${dbName}`)
        )
        cfg.poolerDatabaseUrls.push(
          `postgresql://${role}:${password}@roadmaps-postgres.railway.internal:5432/${dbName}`
        )
        await writeFile(privatePath, JSON.stringify(cfg, null, 2))
        console.log(`${key}: provisioned and registry contract validated`)
      } finally {
        await sql.end()
      }
    })
  )
} finally {
  await control.end()
}
