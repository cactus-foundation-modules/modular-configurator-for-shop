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
import type { BufferGeometry, Mesh, Object3D, Texture } from 'three'
import { fetchBundle } from '@/modules/product-3d-views-for-shop/lib/fabric-fetch'
import { applyFabricPaint, disposeModel, loadModel } from '@/modules/product-3d-views-for-shop/lib/three/load-model'
import type { FabricBundle } from '@/modules/product-3d-views-for-shop/lib/types'
import type { StorefrontPiece } from '@/modules/modular-configurator-for-shop/lib/storefront-types'
import { curveCentre, curveLayOf, halfCurveCentre, isReversible, segmentCorners, segmentInset } from '@/modules/modular-configurator-for-shop/lib/chain-geometry'
import { AUTOMATIC_MODEL_TURN, orientModel, rasteriseTops } from '@/modules/modular-configurator-for-shop/lib/model-orientation'

export interface UnitModelRequest {
  parentProductId: string
  /** The exact variation this unit is, or null while an option is unchosen. */
  childProductId: string | null
  piece: StorefrontPiece
  /** The unit is laid the other way round (a curve with no back). */
  flipped: boolean
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
      const object = await standOnFootprint(model, request.piece, request.flipped, source.url)
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
  return buildPlaceholder(request.piece, request.flipped, request.placeholderColour)
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
 * Quarter turns found per model file and unit shape. The same file is often
 * placed several times in one layout, and loaded again on every fabric change;
 * the answer never changes, so it is worked out once.
 */
const turnsFound = new Map<string, number>()

/**
 * Turns the model to face forwards, scales it so its width matches the unit's
 * declared width, and stands it centred on the origin with its feet on the
 * floor. The declared footprint is the truth the layout is built from, so the
 * model is fitted to it rather than the other way round.
 */
async function standOnFootprint(model: Object3D, piece: StorefrontPiece, flipped: boolean, sourceUrl: string): Promise<Object3D> {
  const { Box3, Group, Vector3 } = await import('three')
  const turned = new Group()
  turned.add(model)
  turned.rotation.y = await modelTurnFor(model, piece, flipped, sourceUrl)
  turned.updateMatrixWorld(true)

  const measured = new Box3().setFromObject(turned, true)
  const size = measured.getSize(new Vector3())
  const targetWidth = piece.definition.widthMm / MILLIMETRES_PER_METRE
  if (size.x > 0) turned.scale.setScalar(targetWidth / size.x)
  turned.updateMatrixWorld(true)

  const fitted = new Box3().setFromObject(turned, true)
  const centre = fitted.getCenter(new Vector3())
  // Centred on the footprint like every other unit. A backless unit that sits
  // flush with its neighbour's front is already placed there by the layout
  // maths, so nudging the model forward here would count the flush twice.
  turned.position.set(-centre.x, -fitted.min.y, -centre.z)
  const { shape } = piece.definition
  if (shape.kind === 'straight' && shape.backless) {
    const halfDepth = piece.definition.depthMm / MILLIMETRES_PER_METRE / 2
    turned.position.z += halfDepth - fitted.max.z
  }

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

/** three.js `rotation.y` that brings this model round to the unit's own frame. */
async function modelTurnFor(model: Object3D, piece: StorefrontPiece, flipped: boolean, sourceUrl: string): Promise<number> {
  const setting = piece.modelTurnDegrees
  if (setting !== AUTOMATIC_MODEL_TURN) {
    // The owner's turn is for the unit laid its usual way; laid the other way a
    // curve's frame is a quarter turn round, a half curve's or a wedge's a half
    // turn (see chain-geometry's curve and wedge faces).
    const halfTurn = piece.definition.shape.kind === 'half-curve' || piece.definition.shape.kind === 'segment'
    const layTurn = isReversible(piece.definition) && flipped ? (halfTurn ? Math.PI : -Math.PI / 2) : 0
    // Clockwise seen from above, which is a negative turn about three's y axis.
    return (-setting * Math.PI) / 180 + layTurn
  }
  const key = `${sourceUrl.split('?')[0] ?? sourceUrl}|${JSON.stringify(piece.definition)}|${flipped ? 'flipped' : 'usual'}`
  const known = turnsFound.get(key)
  if (known !== undefined) return (known * Math.PI) / 2
  const grid = await topsOf(model)
  const quarterTurns = grid ? orientModel(grid, piece.definition, flipped).quarterTurns : 0
  turnsFound.set(key, quarterTurns)
  return (quarterTurns * Math.PI) / 2
}

/** The model's top surface from above, in its own frame, or null when it has no triangles. */
async function topsOf(model: Object3D) {
  const { Box3, Vector3 } = await import('three')
  model.updateMatrixWorld(true)
  const bounds = new Box3().setFromObject(model, true)
  if (bounds.isEmpty()) return null
  const meshes: Mesh[] = []
  model.traverse((child) => {
    const mesh = child as Mesh
    if (mesh.isMesh) meshes.push(mesh)
  })
  const a = new Vector3()
  const b = new Vector3()
  const c = new Vector3()
  return rasteriseTops(
    { minX: bounds.min.x, maxX: bounds.max.x, minY: bounds.min.y, maxY: bounds.max.y, minZ: bounds.min.z, maxZ: bounds.max.z },
    (visit) => {
      for (const mesh of meshes) {
        const geometry: BufferGeometry = mesh.geometry
        const position = geometry.getAttribute('position')
        if (!position) continue
        const index = geometry.getIndex()
        const count = index ? index.count : position.count
        const cornerAt = (slot: number) => (index ? index.getX(slot) : slot)
        for (let slot = 0; slot + 2 < count; slot += 3) {
          a.fromBufferAttribute(position, cornerAt(slot)).applyMatrix4(mesh.matrixWorld)
          b.fromBufferAttribute(position, cornerAt(slot + 1)).applyMatrix4(mesh.matrixWorld)
          c.fromBufferAttribute(position, cornerAt(slot + 2)).applyMatrix4(mesh.matrixWorld)
          visit(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z)
        }
      }
    },
  )
}

/** Seat height, back height and panel thickness of the stand-in block, in metres. */
const BLOCK_SEAT_HEIGHT = 0.42
const BLOCK_BACK_HEIGHT = 0.4
const BLOCK_PANEL = 0.14

async function buildPlaceholder(piece: StorefrontPiece, flipped: boolean, colour: string): Promise<BuiltUnitModel> {
  const three = await import('three')
  const { BoxGeometry, Color, Group, Mesh, MeshStandardMaterial } = three
  const width = piece.definition.widthMm / MILLIMETRES_PER_METRE
  const depth = piece.definition.depthMm / MILLIMETRES_PER_METRE
  const material = new MeshStandardMaterial({ color: new Color(colour), roughness: 0.85, metalness: 0 })
  const group = new Group()
  const geometries: BufferGeometry[] = []

  function add(geometry: BufferGeometry, x: number, y: number, z: number): void {
    geometries.push(geometry)
    const mesh = new Mesh(geometry, material)
    mesh.position.set(x, y, z)
    mesh.castShadow = true
    mesh.receiveShadow = true
    group.add(mesh)
  }

  function block(sizeX: number, sizeY: number, sizeZ: number, x: number, y: number, z: number): void {
    add(new BoxGeometry(sizeX, sizeY, sizeZ), x, y, z)
  }

  /**
   * A floor outline (unit frame, metres) stood up to `height` from `base`. The
   * outline is drawn in x and -z so that, laid flat, its y points along +z.
   */
  function extruded(outline: InstanceType<typeof three.Shape>, base: number, height: number): void {
    const geometry = new three.ExtrudeGeometry(outline, { depth: height, bevelEnabled: false, curveSegments: 24 })
    geometry.rotateX(-Math.PI / 2)
    add(geometry, 0, base, 0)
  }

  const { shape } = piece.definition
  const backY = BLOCK_SEAT_HEIGHT + BLOCK_BACK_HEIGHT / 2
  switch (shape.kind) {
    case 'straight': {
      block(width, BLOCK_SEAT_HEIGHT, depth, 0, BLOCK_SEAT_HEIGHT / 2, 0)
      if (!shape.backless) block(width, BLOCK_BACK_HEIGHT, BLOCK_PANEL, 0, backY, -depth / 2 + BLOCK_PANEL / 2)
      const armHeight = BLOCK_BACK_HEIGHT * 0.45
      const armY = BLOCK_SEAT_HEIGHT + armHeight / 2
      if (shape.closedLeft) block(BLOCK_PANEL * 0.8, armHeight, depth, -width / 2 + BLOCK_PANEL * 0.4, armY, 0)
      if (shape.closedRight) block(BLOCK_PANEL * 0.8, armHeight, depth, width / 2 - BLOCK_PANEL * 0.4, armY, 0)
      break
    }
    case 'corner': {
      block(width, BLOCK_SEAT_HEIGHT, depth, 0, BLOCK_SEAT_HEIGHT / 2, 0)
      block(width, BLOCK_BACK_HEIGHT, BLOCK_PANEL, 0, backY, -depth / 2 + BLOCK_PANEL / 2)
      const sideX = shape.backSide === 'left' ? -width / 2 + BLOCK_PANEL / 2 : width / 2 - BLOCK_PANEL / 2
      block(BLOCK_PANEL, BLOCK_BACK_HEIGHT, depth, sideX, backY, 0)
      break
    }
    case 'curve': {
      const lay = curveLayOf(shape.back, flipped)
      const centre = curveCentre(piece.definition.widthMm, lay)
      const centreX = centre.x / MILLIMETRES_PER_METRE
      const centreZ = centre.z / MILLIMETRES_PER_METRE
      const outer = width
      const inner = width - shape.seatDepthMm / MILLIMETRES_PER_METRE
      // The quarter of the ring inside the footprint, as angles in the outline's
      // (x, -z) plane: from the entry face round to the exit face.
      const from = lay === 'outside' ? Math.PI / 2 : -Math.PI / 2
      const ring = (innerRadius: number, outerRadius: number) => {
        const outline = new three.Shape()
        outline.absarc(centreX, -centreZ, outerRadius, from, 0, lay === 'outside')
        outline.absarc(centreX, -centreZ, innerRadius, 0, from, lay !== 'outside')
        outline.closePath()
        return outline
      }
      extruded(ring(inner, outer), 0, BLOCK_SEAT_HEIGHT)
      if (shape.back === 'outside') extruded(ring(outer - BLOCK_PANEL, outer), BLOCK_SEAT_HEIGHT, BLOCK_BACK_HEIGHT)
      if (shape.back === 'inside') extruded(ring(inner, inner + BLOCK_PANEL), BLOCK_SEAT_HEIGHT, BLOCK_BACK_HEIGHT)
      break
    }
    case 'half-curve': {
      const lay = curveLayOf(shape.back, flipped)
      const centreZ = halfCurveCentre(piece.definition.depthMm, lay).z / MILLIMETRES_PER_METRE
      const outer = width / 2
      const inner = outer - shape.seatDepthMm / MILLIMETRES_PER_METRE
      // Half the ring, as angles in the outline's (x, -z) plane: from the left cut
      // end round the far side (+PI/2 laid the outside way, -PI/2 the inside way)
      // to the right cut end.
      const clockwise = lay === 'outside'
      const ring = (innerRadius: number, outerRadius: number) => {
        const outline = new three.Shape()
        outline.absarc(0, -centreZ, outerRadius, Math.PI, 0, clockwise)
        outline.absarc(0, -centreZ, innerRadius, 0, Math.PI, !clockwise)
        outline.closePath()
        return outline
      }
      extruded(ring(inner, outer), 0, BLOCK_SEAT_HEIGHT)
      if (shape.back === 'outside') extruded(ring(outer - BLOCK_PANEL, outer), BLOCK_SEAT_HEIGHT, BLOCK_BACK_HEIGHT)
      if (shape.back === 'inside') extruded(ring(inner, inner + BLOCK_PANEL), BLOCK_SEAT_HEIGHT, BLOCK_BACK_HEIGHT)
      break
    }
    case 'round-end': {
      const outline = new three.Shape()
      outline.moveTo(-width / 2, depth / 2)
      outline.lineTo(width / 2, depth / 2)
      outline.absellipse(0, depth / 2, width / 2, depth, 0, -Math.PI, true)
      outline.closePath()
      extruded(outline, 0, BLOCK_SEAT_HEIGHT)
      break
    }
    case 'segment': {
      const lay = curveLayOf(shape.back, flipped)
      const inset = segmentInset(piece.definition.depthMm, shape.angleDegrees) / MILLIMETRES_PER_METRE
      /** A floor polygon (unit frame, metres) as an outline in x and -z. */
      const polygon = (corners: ReadonlyArray<{ x: number; z: number }>) => {
        const outline = new three.Shape()
        corners.forEach((corner, index) => (index === 0 ? outline.moveTo(corner.x, -corner.z) : outline.lineTo(corner.x, -corner.z)))
        outline.closePath()
        return outline
      }
      /** Half the wedge's width `fromBack` metres forward of its back. */
      const halfAcross = (fromBack: number) => width / 2 - inset * (lay === 'outside' ? fromBack / depth : 1 - fromBack / depth)
      const corners = segmentCorners(piece.definition.widthMm, piece.definition.depthMm, shape.angleDegrees, lay).map((corner) => ({
        x: corner.x / MILLIMETRES_PER_METRE,
        z: corner.z / MILLIMETRES_PER_METRE,
      }))
      extruded(polygon(corners), 0, BLOCK_SEAT_HEIGHT)
      const backZ = -depth / 2
      if (shape.back !== 'none') {
        extruded(
          polygon([
            { x: -halfAcross(0), z: backZ },
            { x: halfAcross(0), z: backZ },
            { x: halfAcross(BLOCK_PANEL), z: backZ + BLOCK_PANEL },
            { x: -halfAcross(BLOCK_PANEL), z: backZ + BLOCK_PANEL },
          ]),
          BLOCK_SEAT_HEIGHT,
          BLOCK_BACK_HEIGHT,
        )
      }
      const armHeight = BLOCK_BACK_HEIGHT * 0.45
      const arm = (sign: -1 | 1) =>
        extruded(
          polygon([
            { x: sign * halfAcross(0), z: backZ },
            { x: sign * (halfAcross(0) - BLOCK_PANEL * 0.8), z: backZ },
            { x: sign * (halfAcross(depth) - BLOCK_PANEL * 0.8), z: depth / 2 },
            { x: sign * halfAcross(depth), z: depth / 2 },
          ]),
          BLOCK_SEAT_HEIGHT,
          armHeight,
        )
      if (shape.closedLeft) arm(-1)
      if (shape.closedRight) arm(1)
      break
    }
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
