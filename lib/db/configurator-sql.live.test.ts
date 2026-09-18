import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { TestDatabase, TestRole, VpsConfig } from '@/lib/backup/vps-database'

// The variation payload asks whether the viewer is staff, which reads the
// session cookie. There is no request here, so the answer is "a shopper".
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined }),
  headers: async () => new Headers(),
}))

// Every raw statement this module ships, ACTUALLY EXECUTED by Postgres.
//
// Nothing else runs one: tsc and eslint see strings, npm test never opens a
// connection, and the module build gate builds without querying. So this
// provisions its OWN throwaway database on the self-hosted Postgres VPS
// (`cactus_rt_*`, owned by a throwaway role, dropped afterwards plus a
// prefix-scoped sweep) and runs the module's migration and every query against
// real tables from shop, shop-variations, product attributes and 3D views. The
// live site's database on the same server is never named, opened or altered.
//
// Skipped unless opted into, so a plain `npm test` never touches the network:
//
//   RUN_MODULAR_CONFIGURATOR_SQL=1 npx vitest run modules/modular-configurator-for-shop/lib/db/configurator-sql.live.test.ts
//
// with OVH_SERVER / OVH_USER / OVH_PASSWORD exported. A skip is not a pass.
//
// EVERY value import below is dynamic: the shared Prisma client reads
// DATABASE_URL once, when first loaded, and this database does not exist until
// beforeAll has made it.
const shouldRun = process.env.RUN_MODULAR_CONFIGURATOR_SQL === '1'
const suite = shouldRun ? describe : describe.skip

const CORE_SQL = readFileSync(path.join(process.cwd(), 'prisma/migrations/20260626000000_init/migration.sql'), 'utf8')

/** Statement splitter aware of quotes and dollar-quoting (module migrations use DO $$ blocks). */
function splitStatements(sql: string): string[] {
  const statements: string[] = []
  let current = ''
  let at = 0
  while (at < sql.length) {
    const rest = sql.slice(at)
    if (rest.startsWith('--')) {
      const end = sql.indexOf('\n', at)
      at = end === -1 ? sql.length : end + 1
      continue
    }
    if (rest.startsWith('/*')) {
      const end = sql.indexOf('*/', at + 2)
      at = end === -1 ? sql.length : end + 2
      continue
    }
    const character = sql.charAt(at)
    if (character === "'" || character === '"') {
      let end = at + 1
      while (end < sql.length) {
        if (sql.charAt(end) === character) {
          if (sql.charAt(end + 1) === character) {
            end += 2
            continue
          }
          end += 1
          break
        }
        end += 1
      }
      current += sql.slice(at, end)
      at = end
      continue
    }
    const dollar = /^\$[A-Za-z_]*\$/.exec(rest)
    if (dollar) {
      const tag = dollar[0]
      const end = sql.indexOf(tag, at + tag.length)
      const stop = end === -1 ? sql.length : end + tag.length
      current += sql.slice(at, stop)
      at = stop
      continue
    }
    if (character === ';') {
      if (current.trim()) statements.push(current.trim())
      current = ''
      at += 1
      continue
    }
    current += character
    at += 1
  }
  if (current.trim()) statements.push(current.trim())
  return statements
}

function moduleSql(moduleName: string): string[] {
  const directory = path.join(process.cwd(), 'modules', moduleName, 'migrations')
  return readdirSync(directory)
    .filter((file) => file.endsWith('.sql'))
    .sort()
    .flatMap((file) => splitStatements(readFileSync(path.join(directory, file), 'utf8')))
}

const PARENT_ID = 'mcf-parent'
const SET_ID = 'mcf-set'
const UNITS = [
  { slug: 'left-unit', label: 'Left Unit', width: '79cm' },
  { slug: 'central-unit', label: 'Central Unit', width: '66cm' },
  { slug: 'corner-unit', label: 'Corner Unit', width: '76cm' },
]

suite('modular-configurator-for-shop raw SQL, against a real Postgres', () => {
  let cfg: VpsConfig
  let role: TestRole
  let database: TestDatabase
  const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  const databaseName = `cactus_rt_mcf_${stamp}`
  const roleName = `cactus_rt_role_mcf_${stamp}`

  type Modules = {
    prisma: typeof import('@/lib/db/prisma')
    configs: typeof import('@/modules/modular-configurator-for-shop/lib/db/configs')
    specSizes: typeof import('@/modules/modular-configurator-for-shop/lib/db/spec-sizes')
    adminPayload: typeof import('@/modules/modular-configurator-for-shop/lib/admin-payload')
    layoutLinks: typeof import('@/modules/modular-configurator-for-shop/lib/db/layout-links')
    linkAdminPayload: typeof import('@/modules/modular-configurator-for-shop/lib/layout-link-admin-payload')
    linkStorefront: typeof import('@/modules/modular-configurator-for-shop/lib/layout-link-storefront')
  }
  let modules: Modules
  let vps: typeof import('@/lib/backup/vps-database')

  beforeAll(async () => {
    vps = await import('@/lib/backup/vps-database')
    cfg = vps.vpsConfigFromEnv()
    await vps.dropStaleTestObjects(cfg)
    role = await vps.createTestRole(cfg, roleName)
    database = await vps.createTestDatabase(cfg, databaseName, role)
    process.env.DATABASE_URL = database.connectionUri
    process.env.DIRECT_URL = database.connectionUri

    modules = {
      prisma: await import('@/lib/db/prisma'),
      configs: await import('@/modules/modular-configurator-for-shop/lib/db/configs'),
      specSizes: await import('@/modules/modular-configurator-for-shop/lib/db/spec-sizes'),
      adminPayload: await import('@/modules/modular-configurator-for-shop/lib/admin-payload'),
      layoutLinks: await import('@/modules/modular-configurator-for-shop/lib/db/layout-links'),
      linkAdminPayload: await import('@/modules/modular-configurator-for-shop/lib/layout-link-admin-payload'),
      linkStorefront: await import('@/modules/modular-configurator-for-shop/lib/layout-link-storefront'),
    }
    const { prisma } = modules.prisma

    for (let attempt = 0; ; attempt += 1) {
      try {
        await prisma.$queryRawUnsafe('SELECT 1')
        break
      } catch (error) {
        if (attempt >= 15) throw error
        await new Promise((resolve) => setTimeout(resolve, 2000))
      }
    }

    // In the order an install applies them.
    for (const statement of splitStatements(CORE_SQL)) await prisma.$executeRawUnsafe(statement)
    for (const moduleName of ['shop', 'shop-variations', 'product-attributes-for-shop', 'product-3d-views-for-shop', 'modular-configurator-for-shop']) {
      for (const statement of moduleSql(moduleName)) await prisma.$executeRawUnsafe(statement)
    }

    // A small modular range: one listing, a Unit option with three values, one
    // variation per unit, and an Overall Width/Depth specification on each.
    await prisma.$executeRawUnsafe(`INSERT INTO "shp_products" ("id", "name", "slug", "type", "status", "price") VALUES ('${PARENT_ID}', 'Modular Seating', 'modular-seating', 'PHYSICAL', 'ACTIVE', 0)`)
    await prisma.$executeRawUnsafe(`INSERT INTO "svr_options" ("id", "product_id", "name") VALUES ('opt-unit', '${PARENT_ID}', 'Unit')`)
    await prisma.$executeRawUnsafe(`INSERT INTO "pat_attributes" ("id", "name", "slug") VALUES ('att-width', 'Overall Width', 'overall-width'), ('att-depth', 'Overall Depth', 'overall-depth')`)
    await prisma.$executeRawUnsafe(`INSERT INTO "pat_attribute_values" ("id", "attribute_id", "label", "slug") VALUES ('val-depth', 'att-depth', '76cm', '76cm')`)
    for (const [index, unit] of UNITS.entries()) {
      const childId = `child-${unit.slug}`
      await prisma.$executeRawUnsafe(`INSERT INTO "shp_products" ("id", "name", "slug", "type", "status", "price") VALUES ('${childId}', 'Modular Seating - ${unit.label}', '${childId}', 'PHYSICAL', 'ACTIVE', ${300 + index * 50})`)
      await prisma.$executeRawUnsafe(`INSERT INTO "svr_option_values" ("id", "option_id", "label", "slug", "position") VALUES ('v-${unit.slug}', 'opt-unit', '${unit.label}', '${unit.slug}', ${index})`)
      await prisma.$executeRawUnsafe(`INSERT INTO "svr_variants" ("id", "product_id", "child_product_id", "position") VALUES ('var-${unit.slug}', '${PARENT_ID}', '${childId}', ${index})`)
      await prisma.$executeRawUnsafe(`INSERT INTO "svr_variant_values" ("variant_id", "option_value_id") VALUES ('var-${unit.slug}', 'v-${unit.slug}')`)
      await prisma.$executeRawUnsafe(`INSERT INTO "pat_attribute_values" ("id", "attribute_id", "label", "slug") VALUES ('val-width-${unit.slug}', 'att-width', '${unit.width}', '${unit.slug}-width') ON CONFLICT DO NOTHING`)
      await prisma.$executeRawUnsafe(`INSERT INTO "pat_product_values" ("product_id", "value_id") VALUES ('${childId}', 'val-width-${unit.slug}'), ('${childId}', 'val-depth')`)
    }
  }, 300_000)

  afterAll(async () => {
    try {
      await modules?.prisma.prisma.$disconnect()
    } catch {
      // Nothing to disconnect if set-up never got that far.
    }
    if (cfg && vps) {
      if (database) await vps.dropTestDatabase(cfg, database.name)
      if (role) await vps.dropTestRole(cfg, role.name)
      await vps.dropStaleTestObjects(cfg)
    }
  }, 300_000)

  it('applies its own migration twice - every statement is idempotent', async () => {
    for (const statement of moduleSql('modular-configurator-for-shop')) {
      await modules.prisma.prisma.$executeRawUnsafe(statement)
    }
    const rows = await modules.prisma.prisma.$queryRaw<Array<{ present: boolean }>>`
      SELECT to_regclass('public.mcf_product_configs') IS NOT NULL AND to_regclass('public.mcf_layout_links') IS NOT NULL AS present
    `
    expect(rows[0]?.present).toBe(true)
  })

  it('saves, reads back and overwrites a set-up, jsonb and all', async () => {
    const { configs } = modules
    expect(await configs.getProductConfigurator(PARENT_ID)).toBeNull()
    const config = {
      pieceOptionName: 'Unit',
      frontUnits: true,
      freeUnits: false,
      maxPieces: 8,
      pieces: [
        { valueSlug: 'left-unit', shape: { kind: 'straight' as const, closedLeft: true, closedRight: false }, widthMm: 790, depthMm: 760, modelTurnDegrees: 0 as const },
        { valueSlug: 'corner-unit', shape: { kind: 'corner' as const, backSide: 'left' as const }, widthMm: 760, depthMm: 760, modelTurnDegrees: 90 as const },
      ],
      presets: [{ name: "Chris's corner - it's a 'test'", valueSlugs: ['left-unit', 'corner-unit'] }],
      viewSummary: 'with-sizes' as const,
    }
    await configs.saveProductConfigurator(PARENT_ID, true, config)
    const saved = await configs.getProductConfigurator(PARENT_ID)
    expect(saved?.enabled).toBe(true)
    expect(saved?.config).toEqual(config)
    expect(typeof saved?.updatedAt).toBe('string')

    await configs.saveProductConfigurator(PARENT_ID, false, { ...config, maxPieces: 3 })
    const overwritten = await configs.getProductConfigurator(PARENT_ID)
    expect(overwritten?.enabled).toBe(false)
    expect(overwritten?.config.maxPieces).toBe(3)
    const count = await modules.prisma.prisma.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*) AS count FROM "mcf_product_configs"`
    expect(Number(count[0]?.count)).toBe(1)
  })

  it('suggests footprints from the specification, in millimetres', async () => {
    const suggestions = await modules.specSizes.suggestFootprints(['child-left-unit', 'child-corner-unit', 'no-such-product'])
    expect(suggestions.get('child-left-unit')).toEqual({ widthMm: 790, depthMm: 760 })
    expect(suggestions.get('child-corner-unit')).toEqual({ widthMm: 760, depthMm: 760 })
    expect(suggestions.has('no-such-product')).toBe(false)
  })

  it('builds the set-up screen payload from the live options', async () => {
    const payload = await modules.adminPayload.loadConfiguratorAdminPayload(PARENT_ID)
    const unitOption = payload?.options.find((option) => option.name === 'Unit')
    expect(unitOption?.values.map((value) => [value.slug, value.suggestedWidthMm, value.suggestedDepthMm])).toEqual([
      ['left-unit', 790, 760],
      ['central-unit', 660, 760],
      ['corner-unit', 760, 760],
    ])
  })

  it('saves, reads back, lists targets for and removes a link to the builder', async () => {
    const { configs, layoutLinks, linkAdminPayload, linkStorefront } = modules
    const { prisma } = modules.prisma
    await prisma.$executeRawUnsafe(`INSERT INTO "shp_products" ("id", "name", "slug", "type", "status", "price") VALUES ('${SET_ID}', 'Seating Set', 'seating-set', 'PHYSICAL', 'ACTIVE', 0)`)
    await prisma.$executeRawUnsafe(`INSERT INTO "svr_options" ("id", "product_id", "name") VALUES ('opt-seats', '${SET_ID}', 'Seats')`)
    await prisma.$executeRawUnsafe(`INSERT INTO "svr_option_values" ("id", "option_id", "label", "slug", "position") VALUES ('v-two', 'opt-seats', '2 Seater', '2-seater', 0)`)
    await configs.saveProductConfigurator(PARENT_ID, true, {
      pieceOptionName: 'Unit',
      frontUnits: true,
      freeUnits: false,
      maxPieces: 8,
      pieces: [
        { valueSlug: 'left-unit', shape: { kind: 'straight', closedLeft: true, closedRight: false }, widthMm: 790, depthMm: 760, modelTurnDegrees: 'auto' },
        { valueSlug: 'central-unit', shape: { kind: 'straight', closedLeft: false, closedRight: false }, widthMm: 660, depthMm: 760, modelTurnDegrees: 'auto' },
      ],
      presets: [],
      viewSummary: 'always',
    })

    expect(await layoutLinks.getLayoutLink(SET_ID)).toBeNull()
    expect(await layoutLinks.listBuilderProducts()).toEqual([{ productId: PARENT_ID, name: 'Modular Seating', slug: 'modular-seating' }])

    const link = {
      targetProductId: PARENT_ID,
      leadText: "Fancy a 'bespoke' one?",
      linkText: 'Build it',
      newTab: true,
      startingLayouts: [
        { when: null, valueSlugs: ['left-unit', 'central-unit'] },
        { when: { optionName: 'Seats', valueSlug: '2-seater' }, valueSlugs: ['left-unit'] },
      ],
    }
    await layoutLinks.saveLayoutLink(SET_ID, link)
    expect(await layoutLinks.getLayoutLink(SET_ID)).toEqual(link)
    await layoutLinks.saveLayoutLink(SET_ID, { ...link, newTab: false, startingLayouts: [] })
    expect(await layoutLinks.getLayoutLink(SET_ID)).toEqual({ ...link, newTab: false, startingLayouts: [] })
    await layoutLinks.saveLayoutLink(SET_ID, link)

    const admin = await linkAdminPayload.loadLayoutLinkAdminPayload(SET_ID)
    expect(admin.ownOptions).toEqual([{ name: 'Seats', values: [{ slug: '2-seater', label: '2 Seater' }] }])
    expect(admin.builders.map((builder) => [builder.productId, builder.units.map((unit) => unit.slug)])).toEqual([[PARENT_ID, ['left-unit', 'central-unit']]])

    const block = await linkStorefront.loadLayoutLinkBlockData('seating-set')
    expect(block?.targetHref).toMatch(/\/modular-seating$/)
    expect(block?.startingLayouts).toEqual(link.startingLayouts)
    expect(block?.targetOptions).toEqual([])

    const builder = await configs.getProductConfigurator(PARENT_ID)
    if (!builder) throw new Error('The builder set-up saved above has gone')
    await configs.saveProductConfigurator(PARENT_ID, false, builder.config)
    expect(await linkStorefront.loadLayoutLinkBlockData('seating-set')).toBeNull()

    await layoutLinks.deleteLayoutLink(SET_ID)
    expect(await layoutLinks.getLayoutLink(SET_ID)).toBeNull()
    await layoutLinks.saveLayoutLink(SET_ID, link)
  })

  it('goes when its product goes', async () => {
    await modules.prisma.prisma.$executeRawUnsafe(`DELETE FROM "shp_products" WHERE "id" = '${PARENT_ID}'`)
    expect(await modules.configs.getProductConfigurator(PARENT_ID)).toBeNull()
    // A link to a builder that no longer exists goes with it.
    expect(await modules.layoutLinks.getLayoutLink(SET_ID)).toBeNull()
  })
})
