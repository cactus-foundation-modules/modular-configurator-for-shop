import { NextRequest, NextResponse } from 'next/server'
import { requireShopUser } from '@/modules/shop/lib/access'
import { getProductById } from '@/modules/shop/lib/db/products'
import { SaveLayoutLinkBodySchema } from '@/modules/modular-configurator-for-shop/lib/layout-link-schema'
import { deleteLayoutLink, saveLayoutLink } from '@/modules/modular-configurator-for-shop/lib/db/layout-links'
import { linkTargetFrom, loadLayoutLinkAdminPayload } from '@/modules/modular-configurator-for-shop/lib/layout-link-admin-payload'
import { validateLayoutLink } from '@/modules/modular-configurator-for-shop/lib/layout-link-validation'

type RouteContext = { params: Promise<{ productId: string }> }

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const gate = await requireShopUser('shop.products', { allowAccess: true })
  if (gate.error) return gate.error
  const { productId } = await params
  if (!(await getProductById(productId))) return NextResponse.json({ error: 'Product not found' }, { status: 404 })
  return NextResponse.json(await loadLayoutLinkAdminPayload(productId))
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
    return NextResponse.json({ error: 'The layout builder link could not be read' }, { status: 400 })
  }
  const parsed = SaveLayoutLinkBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Some of the link is missing or too long - check the link text and the starting layouts' }, { status: 400 })
  }

  const { link } = parsed.data
  if (!link) {
    await deleteLayoutLink(productId)
    return NextResponse.json(await loadLayoutLinkAdminPayload(productId))
  }

  const current = await loadLayoutLinkAdminPayload(productId)
  const problem = validateLayoutLink(link, productId, current.ownOptions, linkTargetFrom(current, link.targetProductId))
  if (problem) return NextResponse.json({ error: problem }, { status: 400 })

  await saveLayoutLink(productId, link)
  return NextResponse.json(await loadLayoutLinkAdminPayload(productId))
}
