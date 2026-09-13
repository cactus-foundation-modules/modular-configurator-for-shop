import { NextRequest, NextResponse } from 'next/server'
import { requireShopUser } from '@/modules/shop/lib/access'
import { getProductById } from '@/modules/shop/lib/db/products'
import { SaveConfiguratorBodySchema } from '@/modules/modular-configurator-for-shop/lib/config-schema'
import { saveProductConfigurator } from '@/modules/modular-configurator-for-shop/lib/db/configs'
import { loadConfiguratorAdminPayload } from '@/modules/modular-configurator-for-shop/lib/admin-payload'
import { validateConfigAgainstOptions } from '@/modules/modular-configurator-for-shop/lib/config-validation'

type RouteContext = { params: Promise<{ productId: string }> }

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const gate = await requireShopUser('shop.products', { allowAccess: true })
  if (gate.error) return gate.error
  const { productId } = await params
  const payload = await loadConfiguratorAdminPayload(productId)
  if (!payload) return NextResponse.json({ error: 'That product has no variations to build layouts from' }, { status: 404 })
  return NextResponse.json(payload)
}

export async function PUT(request: NextRequest, { params }: RouteContext) {
  const gate = await requireShopUser('shop.products')
  if (gate.error) return gate.error
  const { productId } = await params
  if (!(await getProductById(productId))) return NextResponse.json({ error: 'Product not found' }, { status: 404 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'The layout builder set-up could not be read' }, { status: 400 })
  }
  const parsed = SaveConfiguratorBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Some of the layout builder set-up is out of range - check the sizes and names' }, { status: 400 })
  }

  const current = await loadConfiguratorAdminPayload(productId)
  if (!current) return NextResponse.json({ error: 'That product has no variations to build layouts from' }, { status: 404 })
  const problem = validateConfigAgainstOptions(parsed.data, current.options)
  if (problem) return NextResponse.json({ error: problem }, { status: 400 })

  await saveProductConfigurator(productId, parsed.data.enabled, parsed.data.config)
  return NextResponse.json(await loadConfiguratorAdminPayload(productId))
}
