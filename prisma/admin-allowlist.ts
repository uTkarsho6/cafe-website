/**
 * Admin allowlist provisioning (ADR-010, DEPLOYMENT.md §6). Server-side only: there is no admin
 * signup or self-service "make me admin" anywhere in the app.
 *
 *   npm run admin:add -- --user-id <supabase-user-uuid> --email <email> [--name "Display name"]
 *   npm run admin:disable -- --email <email>      (keeps the row and its audit history)
 *   npm run admin:list
 *
 * The user must first exist in Supabase Auth (dashboard → Authentication → Users → Add user);
 * copy its "User UID". No password or Supabase secret key is handled here.
 */
import { scriptClient } from './client'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1]?.trim() : undefined
}

function fail(message: string): never {
  console.error(message)
  process.exit(1)
}

async function main() {
  const command = process.argv[2]
  if (process.env.VERCEL_ENV === 'production' && !process.argv.includes('--production')) {
    fail('Refused: add --production to change the production allowlist (Phase 8 procedure).')
  }
  const db = scriptClient()
  try {
    if (command === 'add') {
      const userId = arg('user-id')
      const email = arg('email')?.toLowerCase()
      const name = arg('name')?.slice(0, 60) || null
      if (!userId || !UUID.test(userId)) fail('--user-id must be the Supabase "User UID" (a UUID).')
      if (!email || !EMAIL.test(email) || email.length > 254) fail('--email must be a valid email.')
      // Same email on another Supabase account (the old one was deleted and recreated): re-link
      // that row instead of failing on the unique email, so its audit history stays attached.
      const sameEmail = await db.adminUser.findUnique({
        where: { email },
        select: { id: true, authUserId: true },
      })
      const row =
        sameEmail && sameEmail.authUserId !== userId
          ? await db.adminUser.update({
              where: { id: sameEmail.id },
              data: { authUserId: userId, displayName: name, isActive: true },
              select: { id: true },
            })
          : await db.adminUser.upsert({
              where: { authUserId: userId },
              create: { authUserId: userId, email, displayName: name, isActive: true },
              update: { email, displayName: name, isActive: true },
              select: { id: true },
            })
      await db.auditLog.create({
        data: {
          adminUserId: row.id,
          action: 'ADMIN_ALLOWLISTED',
          entityType: 'adminUser',
          entityId: row.id,
          summary: 'Added to the admin allowlist by the provisioning script',
        },
      })
      console.log(`Admin allowlisted: ${email}`)
    } else if (command === 'disable') {
      const email = arg('email')?.toLowerCase()
      if (!email) fail('--email is required.')
      const res = await db.adminUser.updateMany({ where: { email }, data: { isActive: false } })
      console.log(res.count ? `Admin disabled: ${email}` : `No admin with email ${email}.`)
    } else if (command === 'list') {
      const rows = await db.adminUser.findMany({
        orderBy: { createdAt: 'asc' },
        select: { email: true, isActive: true, lastLoginAt: true },
      })
      for (const r of rows)
        console.log(
          `${r.isActive ? 'active  ' : 'disabled'}  ${r.email}  last login: ${r.lastLoginAt?.toISOString() ?? 'never'}`,
        )
      if (rows.length === 0) console.log('No admins yet.')
    } else {
      fail('Usage: admin:add | admin:disable | admin:list (see prisma/admin-allowlist.ts)')
    }
  } finally {
    await db.$disconnect()
  }
}

main().catch((err: unknown) => {
  const e = err as { name?: string; code?: string }
  console.error(`Failed: ${e?.name ?? 'Error'}${e?.code ? ` (${e.code})` : ''}`)
  process.exit(1)
})
