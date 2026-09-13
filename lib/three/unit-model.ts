'use client'

// One unit of a layout, as a 3D object standing at real size on the floor with
// its front facing +z - the frame the placement maths works in.
//
// The model and its paint come from the 3D views module exactly as its gallery
// gets them: the variation's painted bundle (model file plus fabric slots) where
// one exists, else the unit's plain model file, else a simple block drawn from
// the unit's footprint so the layout still reads. Add-on model context is never
// asked for: in a layout the units are drawn as themselves, whatever accessories
// the shopper has ticked on the page.
//
// three is imported dynamically throughout, like the 3D views module's own
// loaders, so none of it reaches a page until a builder actually opens.
import type { Mesh, Object3D, Texture } from 'three'
import { fetchBundle } from '@/modules/product-3d-views-for-shop/lib/fabric-fetch'
import { applyFabricPaint, disposeModel, loadModel } from '@/modules/product-3d-views-for-shop/lib/three/load-model'
import type { FabricBundle } from '@/modules/product-3d-views-for-shop/lib/types'
import type { StorefrontPiece } from '@/modules/modular-configurator-for-shop/lib/storefront-types'

export interface UnitModelRequest {
  parentProductId: string
  /** The exact variation this unit is, or null while an option is unchosen. */
  childProductId: string | null
  piece: StorefrontPiece
  /** CSS colour for the stand-in block, read from the theme. */
  placeholderColour: string
}

export interface BuiltUnitModel {
  object: Object3D
  kind: 'model' | 'placeholder'
  /** Tears down everything this build created (paint textures, block geometry). */
  dispose: () => void
}

const MILLIMETRES_PER_METRE = 1000

export async function buildUnitModel(request: UnitModelRequest): Promise<BuiltUnitModel> {
  const bundle = await paintedBundleFor(request)
  const source = bundle ? { url: bundle.modelUrl, format: bundle.format } : request.piece.fallbackModel
  if (source) {
    try {
      const model = await loadModel(source.url, source.format)
      const textures = bundle ? await paintSlots(model, bundle.slots) : []
      const object = await standOnFootprint(model, request.piece)
      return {
        object,
        kind: 'model',
        dispose: () => {
          disposeModel(model)
          for (const texture of textures) texture.dispose()
        },
      }
    } catch {
      // A model that will not load must not leave a hole in the layout: the
      // block below stands in, at the same footprint, so the shape still reads.
    }
  }
  return buildPlaceholder(request.piece, request.placeholderColour)
}

async function paintedBundleFor(request: UnitModelRequest): Promise<FabricBundle | null> {
  if (!request.childProductId) return null
  try {
    return await fetchBundle(request.parentProductId, request.childProductId)
  } catch {
    return null
  }
}

async function paintSlots(model: Object3D, slots: FabricBundle['slots']): Promise<Texture[]> {
  const results = await Promise.allSettled(
    slots.map((slot) =>
      applyFabricPaint(model, {
        materialName: slot.materialName,
        textureUrl: slot.textureUrl,
        colour: slot.colour,
        repeat: slot.repeat,
        rotationDeg: slot.rotationDeg,
        gloss: slot.gloss,
        autoScale: slot.autoScale,
      }),
    ),
  )
  return results.flatMap((result) => (result.status === 'fulfilled' && result.value ? [result.value] : []))
}

/**
 * Turns the model to face forwards, scales it so its width matches the unit's
 * declared width, and stands it centred on the origin with its feet on the
 * floor. The declared footprint is the truth the layout is built from, so the
 * model is fitted to it rather than the other way round.
 */
async function standOnFootprint(model: Object3D, piece: StorefrontPiece): Promise<Object3D> {
  const { Box3, Group, Vector3 } = await import('three')
  const turned = new Group()
  turned.add(model)
  // Clockwise seen from above, which is a negative turn about three's y axis.
  turned.rotation.y = (-piece.modelTurnDegrees * Math.PI) / 180
  turned.updateMatrixWorld(true)

  const measured = new Box3().setFromObject(turned, true)
  const size = measured.getSize(new Vector3())
  const targetWidth = piece.definition.widthMm / MILLIMETRES_PER_METRE
  if (size.x > 0) turned.scale.setScalar(targetWidth / size.x)
  turned.updateMatrixWorld(true)

  const fitted = new Box3().setFromObject(turned, true)
  const centre = fitted.getCenter(new Vector3())
  turned.position.set(-centre.x, -fitted.min.y, -centre.z)

  turned.traverse((child) => {
    const mesh = child as Partial<Mesh>
    if (mesh.isMesh) {
      mesh.castShadow = true
      mesh.receiveShadow = true
    }
  })
  const standing = new Group()
  standing.add(turned)
  return standing
}

/** Seat height, back height and panel thickness of the stand-in block, in metres. */
const BLOCK_SEAT_HEIGHT = 0.42
const BLOCK_BACK_HEIGHT = 0.4
const BLOCK_PANEL = 0.14

async function buildPlaceholder(piece: StorefrontPiece, colour: string): Promise<BuiltUnitModel> {
  const { BoxGeometry, Color, Group, Mesh, MeshStandardMaterial } = await import('three')
  const width = piece.definition.widthMm / MILLIMETRES_PER_METRE
  const depth = piece.definition.depthMm / MILLIMETRES_PER_METRE
  const material = new MeshStandardMaterial({ color: new Color(colour), roughness: 0.85, metalness: 0 })
  const group = new Group()
  const geometries: InstanceType<typeof BoxGeometry>[] = []

  function block(sizeX: number, sizeY: number, sizeZ: number, x: number, y: number, z: number): void {
    const geometry = new BoxGeometry(sizeX, sizeY, sizeZ)
    geometries.push(geometry)
    const mesh = new Mesh(geometry, material)
    mesh.position.set(x, y, z)
    mesh.castShadow = true
    mesh.receiveShadow = true
    group.add(mesh)
  }

  block(width, BLOCK_SEAT_HEIGHT, depth, 0, BLOCK_SEAT_HEIGHT / 2, 0)
  const backY = BLOCK_SEAT_HEIGHT + BLOCK_BACK_HEIGHT / 2
  block(width, BLOCK_BACK_HEIGHT, BLOCK_PANEL, 0, backY, -depth / 2 + BLOCK_PANEL / 2)
  const { shape } = piece.definition
  if (shape.kind === 'corner') {
    const sideX = shape.backSide === 'left' ? -width / 2 + BLOCK_PANEL / 2 : width / 2 - BLOCK_PANEL / 2
    block(BLOCK_PANEL, BLOCK_BACK_HEIGHT, depth, sideX, backY, 0)
  } else {
    const armHeight = BLOCK_BACK_HEIGHT * 0.45
    const armY = BLOCK_SEAT_HEIGHT + armHeight / 2
    if (shape.closedLeft) block(BLOCK_PANEL * 0.8, armHeight, depth, -width / 2 + BLOCK_PANEL * 0.4, armY, 0)
    if (shape.closedRight) block(BLOCK_PANEL * 0.8, armHeight, depth, width / 2 - BLOCK_PANEL * 0.4, armY, 0)
  }

  return {
    object: group,
    kind: 'placeholder',
    dispose: () => {
      for (const geometry of geometries) geometry.dispose()
      material.dispose()
    },
  }
}
