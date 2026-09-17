'use client'

// The builder's 3D view: a real-size scene of every unit in a layout, the spaces
// a unit could join, the selected unit and the overall dimensions.
//
// Pattern: an imperative scene object owned by one React island (LayoutStage).
// React tells it WHAT should be there (units with their poses and sources,
// ghosts, selection, sizes) and it works out HOW to get there - loading
// models, easing units into their new places, reframing the camera - on its own
// animation loop, drawing only when something moved. It never reads React state
// and never decides anything about the layout itself: every pose it is handed
// came from the placement maths, which is the one source of truth.
//
// Lighting, tone mapping, decoders and model loading are the 3D views module's,
// so a unit in a layout looks exactly like the same unit in the gallery.
import type {
  DirectionalLight,
  Group,
  Line,
  Mesh,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  ShadowMaterial,
  Sprite,
  WebGLRenderer,
} from 'three'
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { addLights, disposeRenderer, warmKtx2Support } from '@/modules/product-3d-views-for-shop/lib/three/load-model'
import type { FloorRectangle, FloorVector, PiecePose } from '@/modules/modular-configurator-for-shop/lib/chain-geometry'
import { isSpaceKey, type SpaceKey } from '@/modules/modular-configurator-for-shop/lib/chain-editing'
import type { StorefrontViewerLook } from '@/modules/modular-configurator-for-shop/lib/storefront-types'
import type { BuiltUnitModel } from '@/modules/modular-configurator-for-shop/lib/three/unit-model'

type ThreeModule = typeof import('three')

export interface SceneUnit {
  entryId: string
  pose: PiecePose
  footprint: FloorRectangle
  /** The unit's outline on the floor (millimetres), for the highlight under it when chosen. */
  outline: readonly FloorVector[]
  /** Changes whenever what the unit should look like changes (another variation). */
  sourceKey: string
  build: () => Promise<BuiltUnitModel>
}

export interface SceneGhost {
  key: SpaceKey
  footprint: FloorRectangle
  /** The space's outline on the floor (millimetres): the unit that would go there, turned as it would sit. */
  outline: readonly FloorVector[]
}

export interface SceneCallbacks {
  onSelectUnit: (entryId: string | null) => void
  onPickGhost: (key: SpaceKey) => void
  onRemoveUnit: (entryId: string) => void
  onLoadingChange: (unitsLoading: number) => void
  onContextLost: () => void
}

export interface SceneTheme {
  /** CSS colours read from the page's theme tokens. */
  accent: string
  danger: string
  /** Contrasting mark on the danger badge (from `--color-text-inverse`). */
  dangerMark: string
  reducedMotion: boolean
}

export interface DimensionLabels {
  width: HTMLElement
  depth: HTMLElement
}

interface UnitSlot {
  holder: Group
  sourceKey: string | null
  built: BuiltUnitModel | null
  buildToken: number
  target: PiecePose
  footprint: FloorRectangle
  outline: readonly FloorVector[]
  /** 0 while arriving, 1 when settled. */
  arrival: number
}

interface CameraGoal {
  targetX: number
  targetY: number
  targetZ: number
  distance: number
  polar: number | null
  azimuth: number | null
}

const MILLIMETRES_PER_METRE = 1000
const FIELD_OF_VIEW = 40
const ANGLED_POLAR = (58 * Math.PI) / 180
const ANGLED_AZIMUTH = (28 * Math.PI) / 180
const DIMENSION_OFFSET = 0.22
const CLICK_SLOP_PX = 6
const EASE_RATE = 9
/** Height of the remove badge over a unit's middle, in metres. */
const REMOVE_BADGE_HEIGHT = 0.48
/** Where the remove badge moves to when a "+" is drawn over the same unit: up and towards its back. */
const REMOVE_BADGE_CLEAR_HEIGHT = 0.86
const REMOVE_BADGE_CLEAR_BACK_SHARE = 0.3

function toMetres(millimetres: number): number {
  return millimetres / MILLIMETRES_PER_METRE
}

function shortestAngle(from: number, to: number): number {
  let difference = to - from
  while (difference > Math.PI) difference -= 2 * Math.PI
  while (difference < -Math.PI) difference += 2 * Math.PI
  return difference
}

export class LayoutScene {
  private readonly units = new Map<string, UnitSlot>()
  private readonly ghostGroup: Group
  private readonly selectionGroup: Group
  private readonly dimensionGroup: Group
  private readonly ground: Mesh<PlaneGeometry, ShadowMaterial>
  private bounds: FloorRectangle | null = null
  private selectedEntryId: string | null = null
  private dimensionsVisible = false
  private cameraGoal: CameraGoal | null = null
  private userHasMovedCamera = false
  private loading = 0
  private frameHandle = 0
  private lastFrameTime = 0
  private needsRender = true
  private disposed = false
  private pointerDown: { x: number; y: number } | null = null
  private hoverRemoveBadge: Sprite | null = null
  private hoveredEntryId: string | null = null
  private ghostFootprints: FloorRectangle[] = []
  private readonly removeListeners: Array<() => void> = []

  private constructor(
    private readonly three: ThreeModule,
    private readonly canvas: HTMLCanvasElement,
    private readonly renderer: WebGLRenderer,
    private readonly scene: Scene,
    private readonly camera: PerspectiveCamera,
    private readonly controls: OrbitControls,
    private readonly keyLight: DirectionalLight,
    private readonly callbacks: SceneCallbacks,
    private readonly theme: SceneTheme,
    private readonly labels: DimensionLabels,
  ) {
    this.ghostGroup = new three.Group()
    this.selectionGroup = new three.Group()
    this.dimensionGroup = new three.Group()
    this.dimensionGroup.visible = false
    this.ground = new three.Mesh(new three.PlaneGeometry(1, 1), new three.ShadowMaterial({ opacity: 0.3 }))
    this.ground.rotation.x = -Math.PI / 2
    this.ground.receiveShadow = true
    scene.add(this.ground, this.ghostGroup, this.selectionGroup, this.dimensionGroup)
  }

  static async create(
    canvas: HTMLCanvasElement,
    look: StorefrontViewerLook,
    theme: SceneTheme,
    callbacks: SceneCallbacks,
    labels: DimensionLabels,
  ): Promise<LayoutScene> {
    const three = await import('three')
    const { OrbitControls: Controls } = await import('three/examples/jsm/controls/OrbitControls.js')

    const renderer = new three.WebGLRenderer({ canvas, antialias: true, alpha: true })
    renderer.setClearColor(0x000000, 0)
    renderer.outputColorSpace = three.SRGBColorSpace
    renderer.toneMapping =
      look.toneMapping === 'aces' ? three.ACESFilmicToneMapping
        : look.toneMapping === 'neutral' ? three.NeutralToneMapping
          : three.NoToneMapping
    renderer.toneMappingExposure = look.exposure
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = three.PCFSoftShadowMap
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, look.pixelRatioCap))
    warmKtx2Support(renderer)

    const scene = new three.Scene()
    const keyLight = await addLights(scene, renderer, {
      environmentIntensity: look.environmentIntensity,
      ambientIntensity: look.ambientIntensity,
      keyLightIntensity: look.keyLightIntensity,
      fillLightIntensity: look.fillLightIntensity,
    })
    keyLight.castShadow = true
    keyLight.shadow.mapSize.set(1024, 1024)
    keyLight.shadow.radius = 4
    scene.add(keyLight.target)

    const camera = new three.PerspectiveCamera(FIELD_OF_VIEW, 1, 0.05, 200)
    const controls = new Controls(camera, canvas)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.enablePan = false
    controls.minPolarAngle = 0
    controls.maxPolarAngle = Math.PI * 0.49

    const layoutScene = new LayoutScene(three, canvas, renderer, scene, camera, controls, keyLight, callbacks, theme, labels)
    layoutScene.ground.material.opacity = look.shadowOpacity > 0 ? look.shadowOpacity : 0.3
    layoutScene.placeCamera(0, 0.3, 0, 3, ANGLED_POLAR, ANGLED_AZIMUTH)
    layoutScene.attachListeners()
    layoutScene.startLoop()
    return layoutScene
  }

  // ---- What should be there ----------------------------------------------

  setUnits(units: readonly SceneUnit[], bounds: FloorRectangle | null): void {
    const wanted = new Set(units.map((unit) => unit.entryId))
    for (const [entryId, slot] of this.units) {
      if (!wanted.has(entryId)) this.removeUnit(entryId, slot)
    }
    for (const unit of units) {
      const existing = this.units.get(unit.entryId)
      const slot = existing ?? this.addUnit(unit)
      slot.target = unit.pose
      slot.footprint = unit.footprint
      slot.outline = unit.outline
      if (slot.sourceKey !== unit.sourceKey) this.loadUnit(slot, unit)
    }
    const boundsChanged = JSON.stringify(bounds) !== JSON.stringify(this.bounds)
    this.bounds = bounds
    if (boundsChanged) {
      this.fitShadowsAndGround()
      this.rebuildDimensions()
      this.frameLayout()
    }
    this.rebuildSelection()
    this.placeRemoveBadge()
    this.needsRender = true
  }

  setGhosts(ghosts: readonly SceneGhost[]): void {
    this.clearGroup(this.ghostGroup)
    for (const ghost of ghosts) this.ghostGroup.add(this.buildGhost(ghost))
    this.ghostFootprints = ghosts.map((ghost) => ghost.footprint)
    this.placeRemoveBadge()
    this.needsRender = true
  }

  setSelected(entryId: string | null): void {
    this.selectedEntryId = entryId
    this.rebuildSelection()
    this.needsRender = true
  }

  setDimensionsVisible(visible: boolean): void {
    this.dimensionsVisible = visible
    this.dimensionGroup.visible = visible && this.bounds !== null
    this.labels.width.hidden = !this.dimensionGroup.visible
    this.labels.depth.hidden = !this.dimensionGroup.visible
    this.needsRender = true
  }

  resize(width: number, height: number): void {
    if (width <= 0 || height <= 0) return
    this.renderer.setSize(width, height, false)
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    if (!this.userHasMovedCamera) this.frameLayout(true)
    this.needsRender = true
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    cancelAnimationFrame(this.frameHandle)
    for (const remove of this.removeListeners) remove()
    for (const [entryId, slot] of this.units) this.removeUnit(entryId, slot)
    this.clearGroup(this.ghostGroup)
    this.clearGroup(this.selectionGroup)
    this.clearGroup(this.dimensionGroup)
    this.ground.geometry.dispose()
    this.ground.material.dispose()
    this.controls.dispose()
    disposeRenderer(this.renderer)
  }

  // ---- Units ---------------------------------------------------------------

  private addUnit(unit: SceneUnit): UnitSlot {
    const holder = new this.three.Group()
    holder.userData.entryId = unit.entryId
    holder.position.set(toMetres(unit.pose.centre.x), 0, toMetres(unit.pose.centre.z))
    holder.rotation.y = unit.pose.rotationY
    const slot: UnitSlot = {
      holder,
      sourceKey: null,
      built: null,
      buildToken: 0,
      target: unit.pose,
      footprint: unit.footprint,
      outline: unit.outline,
      arrival: this.theme.reducedMotion ? 1 : 0,
    }
    this.scene.add(holder)
    this.units.set(unit.entryId, slot)
    return slot
  }

  private removeUnit(entryId: string, slot: UnitSlot): void {
    if (this.hoveredEntryId === entryId) this.setHoveredEntry(null)
    this.scene.remove(slot.holder)
    slot.built?.dispose()
    slot.built = null
    slot.buildToken += 1
    this.units.delete(entryId)
  }

  private loadUnit(slot: UnitSlot, unit: SceneUnit): void {
    slot.sourceKey = unit.sourceKey
    slot.buildToken += 1
    const token = slot.buildToken
    this.setLoading(this.loading + 1)
    unit
      .build()
      .then((built) => {
        // Superseded (another fabric chosen since) or taken away: throw it back.
        if (this.disposed || slot.buildToken !== token || this.units.get(unit.entryId) !== slot) {
          built.dispose()
          return
        }
        if (slot.built) {
          slot.holder.remove(slot.built.object)
          slot.built.dispose()
        }
        slot.built = built
        built.object.userData.entryId = unit.entryId
        slot.holder.add(built.object)
        this.needsRender = true
      })
      .catch(() => {
        // buildUnitModel already falls back to a block; a failure here is a
        // three.js import that could not load at all, which leaves the plan view.
      })
      .finally(() => this.setLoading(this.loading - 1))
  }

  private setLoading(count: number): void {
    this.loading = Math.max(0, count)
    this.callbacks.onLoadingChange(this.loading)
  }

  // ---- Floor furniture: ghosts, selection, dimensions ----------------------

  /** A line round a floor outline (millimetres), just above the floor. */
  private floorOutline(outline: readonly FloorVector[], colour: string, dashed: boolean, height: number): Object3D {
    const { three } = this
    const geometry = new three.BufferGeometry().setFromPoints(
      outline.map((corner) => new three.Vector3(toMetres(corner.x), height, toMetres(corner.z))),
    )
    const material = dashed
      ? new three.LineDashedMaterial({ color: new three.Color(colour), dashSize: 0.06, gapSize: 0.04 })
      : new three.LineBasicMaterial({ color: new three.Color(colour) })
    const loop = new three.LineLoop(geometry, material)
    if (dashed) loop.computeLineDistances()
    return loop
  }

  /**
   * A see-through fill over a floor outline (millimetres), just above the floor.
   * The outline is drawn in x and -z, so laid flat by the same quarter turn the
   * ground takes it lands the right way round.
   */
  private floorFill(outline: readonly FloorVector[], colour: string, opacity: number, height: number): Mesh {
    const { three } = this
    const shape = new three.Shape(outline.map((corner) => new three.Vector2(toMetres(corner.x), -toMetres(corner.z))))
    const mesh = new three.Mesh(
      new three.ShapeGeometry(shape),
      new three.MeshBasicMaterial({ color: new three.Color(colour), transparent: true, opacity, depthWrite: false, side: three.DoubleSide }),
    )
    mesh.rotation.x = -Math.PI / 2
    mesh.position.y = height
    return mesh
  }

  private buildGhost(ghost: SceneGhost): Group {
    const { three } = this
    const group = new three.Group()
    group.userData.ghostKey = ghost.key
    const fill = this.floorFill(ghost.outline, this.theme.accent, 0.16, 0.004)
    fill.userData.ghostKey = ghost.key
    group.add(fill, this.floorOutline(ghost.outline, this.theme.accent, true, 0.006))
    const plus = this.plusSprite()
    plus.userData.ghostKey = ghost.key
    plus.position.set(
      toMetres((ghost.footprint.minX + ghost.footprint.maxX) / 2),
      0.45,
      toMetres((ghost.footprint.minZ + ghost.footprint.maxZ) / 2),
    )
    group.add(plus)
    return group
  }

  private plusSprite(): Sprite {
    const { three } = this
    const size = 128
    const drawing = document.createElement('canvas')
    drawing.width = size
    drawing.height = size
    const context = drawing.getContext('2d')
    if (context) {
      context.fillStyle = this.theme.accent
      context.beginPath()
      context.arc(size / 2, size / 2, size * 0.46, 0, Math.PI * 2)
      context.fill()
      context.clearRect(size * 0.44, size * 0.24, size * 0.12, size * 0.52)
      context.clearRect(size * 0.24, size * 0.44, size * 0.52, size * 0.12)
    }
    const texture = new three.CanvasTexture(drawing)
    texture.colorSpace = three.SRGBColorSpace
    const sprite = new three.Sprite(new three.SpriteMaterial({ map: texture, depthTest: false, transparent: true }))
    sprite.scale.set(0.22, 0.22, 0.22)
    // Above the remove badge: where the two ever cross on screen, the "+" is the one showing.
    sprite.renderOrder = 12
    return sprite
  }

  private removeSprite(): Sprite {
    const { three } = this
    const size = 128
    const drawing = document.createElement('canvas')
    drawing.width = size
    drawing.height = size
    const context = drawing.getContext('2d')
    if (context) {
      context.fillStyle = this.theme.danger
      context.beginPath()
      context.arc(size / 2, size / 2, size * 0.46, 0, Math.PI * 2)
      context.fill()
      context.strokeStyle = this.theme.dangerMark
      context.lineWidth = size * 0.09
      context.lineCap = 'round'
      const inset = size * 0.3
      context.beginPath()
      context.moveTo(inset, inset)
      context.lineTo(size - inset, size - inset)
      context.moveTo(size - inset, inset)
      context.lineTo(inset, size - inset)
      context.stroke()
    }
    const texture = new three.CanvasTexture(drawing)
    texture.colorSpace = three.SRGBColorSpace
    const sprite = new three.Sprite(new three.SpriteMaterial({ map: texture, depthTest: false, transparent: true }))
    sprite.scale.set(0.2, 0.2, 0.2)
    sprite.renderOrder = 11
    return sprite
  }

  /** A remove badge on the hovered unit, parented to its holder so it glides with it. */
  private setHoveredEntry(entryId: string | null): void {
    if (this.hoveredEntryId === entryId) return
    if (this.hoverRemoveBadge && this.hoveredEntryId) {
      const previous = this.units.get(this.hoveredEntryId)
      previous?.holder.remove(this.hoverRemoveBadge)
    }
    this.hoveredEntryId = entryId
    if (!entryId) {
      this.hoverRemoveBadge = null
      this.needsRender = true
      return
    }
    const slot = this.units.get(entryId)
    if (!slot) return
    if (!this.hoverRemoveBadge) this.hoverRemoveBadge = this.removeSprite()
    this.hoverRemoveBadge.userData.removeEntryId = entryId
    slot.holder.add(this.hoverRemoveBadge)
    this.placeRemoveBadge()
    this.needsRender = true
  }

  /**
   * Puts the remove badge over the middle of the hovered unit - unless a "+" is
   * drawn over that unit too (the space inside an arm unit, where a new unit
   * pushes the arm out), in which case the badge moves up and back so the two
   * never sit on top of each other.
   */
  private placeRemoveBadge(): void {
    const badge = this.hoverRemoveBadge
    const slot = this.hoveredEntryId ? this.units.get(this.hoveredEntryId) : undefined
    if (!badge || !slot) return
    const { footprint } = slot
    const plusOverUnit = this.ghostFootprints.some((ghost) => {
      const x = (ghost.minX + ghost.maxX) / 2
      const z = (ghost.minZ + ghost.maxZ) / 2
      return x > footprint.minX && x < footprint.maxX && z > footprint.minZ && z < footprint.maxZ
    })
    if (!plusOverUnit) {
      badge.position.set(0, REMOVE_BADGE_HEIGHT, 0)
      return
    }
    // The holder turns with the unit, so its own back-to-front depth is whichever
    // footprint side lies along its facing.
    const sideways = Math.abs(Math.sin(slot.target.rotationY)) > 0.5
    const depth = toMetres(sideways ? footprint.maxX - footprint.minX : footprint.maxZ - footprint.minZ)
    badge.position.set(0, REMOVE_BADGE_CLEAR_HEIGHT, -depth * REMOVE_BADGE_CLEAR_BACK_SHARE)
  }

  private rebuildSelection(): void {
    this.clearGroup(this.selectionGroup)
    const slot = this.selectedEntryId ? this.units.get(this.selectedEntryId) : undefined
    if (!slot) return
    // Drawn where the unit is going, not where it is mid-glide: the highlight
    // lands first and the unit settles into it.
    this.selectionGroup.add(
      this.floorFill(slot.outline, this.theme.accent, 0.22, 0.003),
      this.floorOutline(slot.outline, this.theme.accent, false, 0.005),
    )
  }

  private rebuildDimensions(): void {
    this.clearGroup(this.dimensionGroup)
    const bounds = this.bounds
    this.dimensionGroup.visible = this.dimensionsVisible && bounds !== null
    this.labels.width.hidden = !this.dimensionGroup.visible
    this.labels.depth.hidden = !this.dimensionGroup.visible
    if (!bounds) return
    const { three } = this
    const minX = toMetres(bounds.minX)
    const maxX = toMetres(bounds.maxX)
    const minZ = toMetres(bounds.minZ)
    const maxZ = toMetres(bounds.maxZ)
    const frontZ = maxZ + DIMENSION_OFFSET
    const sideX = maxX + DIMENSION_OFFSET
    const tick = 0.06
    const height = 0.01
    const points = [
      [minX, frontZ, maxX, frontZ],
      [minX, frontZ - tick, minX, frontZ + tick],
      [maxX, frontZ - tick, maxX, frontZ + tick],
      [sideX, minZ, sideX, maxZ],
      [sideX - tick, minZ, sideX + tick, minZ],
      [sideX - tick, maxZ, sideX + tick, maxZ],
    ].flatMap(([x1 = 0, z1 = 0, x2 = 0, z2 = 0]) => [new three.Vector3(x1, height, z1), new three.Vector3(x2, height, z2)])
    const colour = getComputedStyle(this.labels.width).color || this.theme.accent
    this.dimensionGroup.add(
      new three.LineSegments(new three.BufferGeometry().setFromPoints(points), new three.LineBasicMaterial({ color: new three.Color(colour) })),
    )
  }

  private positionDimensionLabels(): void {
    const bounds = this.bounds
    if (!bounds || !this.dimensionGroup.visible) return
    const { three } = this
    const width = this.canvas.clientWidth
    const height = this.canvas.clientHeight
    const place = (element: HTMLElement, x: number, z: number) => {
      const projected = new three.Vector3(x, 0.01, z).project(this.camera)
      const behind = projected.z > 1
      element.style.visibility = behind ? 'hidden' : 'visible'
      const left = ((projected.x + 1) / 2) * width
      const top = ((1 - projected.y) / 2) * height
      element.style.transform = `translate(${left}px, ${top}px) translate(-50%, -50%)`
    }
    place(this.labels.width, toMetres((bounds.minX + bounds.maxX) / 2), toMetres(bounds.maxZ) + DIMENSION_OFFSET + 0.12)
    place(this.labels.depth, toMetres(bounds.maxX) + DIMENSION_OFFSET + 0.18, toMetres((bounds.minZ + bounds.maxZ) / 2))
  }

  private fitShadowsAndGround(): void {
    const bounds = this.bounds ?? { minX: -500, maxX: 500, minZ: -500, maxZ: 500 }
    const centreX = toMetres((bounds.minX + bounds.maxX) / 2)
    const centreZ = toMetres((bounds.minZ + bounds.maxZ) / 2)
    const reach = Math.max(toMetres(bounds.maxX - bounds.minX), toMetres(bounds.maxZ - bounds.minZ), 1) * 0.8 + 0.6
    this.ground.scale.set(reach * 4, reach * 4, 1)
    this.ground.position.set(centreX, 0, centreZ)
    this.keyLight.position.set(centreX + reach * 1.2, reach * 2.4, centreZ + reach * 1.6)
    this.keyLight.target.position.set(centreX, 0, centreZ)
    const shadowCamera = this.keyLight.shadow.camera
    shadowCamera.left = -reach
    shadowCamera.right = reach
    shadowCamera.top = reach
    shadowCamera.bottom = -reach
    shadowCamera.near = 0.1
    shadowCamera.far = reach * 8
    shadowCamera.updateProjectionMatrix()
  }

  private clearGroup(group: Group): void {
    for (const child of [...group.children]) {
      group.remove(child)
      child.traverse((node) => {
        const drawable = node as Partial<Mesh> & {
          isSprite?: boolean
          material?: { dispose: () => void; map?: { dispose: () => void } | null }
        }
        // Every Sprite shares one geometry inside three.js; it is not ours to free.
        if (!drawable.isSprite) drawable.geometry?.dispose()
        drawable.material?.map?.dispose()
        drawable.material?.dispose()
      })
    }
  }

  // ---- Camera --------------------------------------------------------------

  private placeCamera(targetX: number, targetY: number, targetZ: number, distance: number, polar: number, azimuth: number): void {
    this.controls.target.set(targetX, targetY, targetZ)
    this.camera.position.set(
      targetX + distance * Math.sin(polar) * Math.sin(azimuth),
      targetY + distance * Math.cos(polar),
      targetZ + distance * Math.sin(polar) * Math.cos(azimuth),
    )
    this.camera.lookAt(this.controls.target)
    this.controls.update()
  }

  /** Eases the camera round to show the whole layout, keeping the shopper's own angle once they have turned it. */
  private frameLayout(immediate = false): void {
    const bounds = this.bounds ?? { minX: -400, maxX: 400, minZ: -400, maxZ: 400 }
    const width = toMetres(bounds.maxX - bounds.minX)
    const depth = toMetres(bounds.maxZ - bounds.minZ)
    const radius = Math.max(0.7, Math.hypot(width / 2, depth / 2, 0.45))
    const verticalHalf = (FIELD_OF_VIEW * Math.PI) / 360
    const horizontalHalf = Math.atan(Math.tan(verticalHalf) * Math.max(this.camera.aspect, 0.1))
    const distance = (radius / Math.sin(Math.min(verticalHalf, horizontalHalf))) * 1.05
    this.controls.minDistance = radius * 0.5
    this.controls.maxDistance = distance * 3
    const goal: CameraGoal = {
      targetX: toMetres((bounds.minX + bounds.maxX) / 2),
      targetY: 0.3,
      targetZ: toMetres((bounds.minZ + bounds.maxZ) / 2),
      distance,
      polar: this.userHasMovedCamera ? null : ANGLED_POLAR,
      azimuth: this.userHasMovedCamera ? null : ANGLED_AZIMUTH,
    }
    if (immediate || this.theme.reducedMotion) {
      const current = this.currentSpherical()
      this.placeCamera(goal.targetX, goal.targetY, goal.targetZ, goal.distance, goal.polar ?? current.polar, goal.azimuth ?? current.azimuth)
      this.cameraGoal = null
    } else {
      this.cameraGoal = goal
    }
    this.needsRender = true
  }

  private currentSpherical(): { distance: number; polar: number; azimuth: number } {
    const offset = this.camera.position.clone().sub(this.controls.target)
    const distance = Math.max(offset.length(), 0.001)
    return { distance, polar: Math.acos(Math.min(1, Math.max(-1, offset.y / distance))), azimuth: Math.atan2(offset.x, offset.z) }
  }

  private stepCamera(ease: number): boolean {
    const goal = this.cameraGoal
    if (!goal) return false
    const current = this.currentSpherical()
    const target = this.controls.target
    const next = {
      x: target.x + (goal.targetX - target.x) * ease,
      y: target.y + (goal.targetY - target.y) * ease,
      z: target.z + (goal.targetZ - target.z) * ease,
      distance: current.distance + (goal.distance - current.distance) * ease,
      polar: goal.polar === null ? current.polar : current.polar + (goal.polar - current.polar) * ease,
      azimuth: goal.azimuth === null ? current.azimuth : current.azimuth + shortestAngle(current.azimuth, goal.azimuth) * ease,
    }
    this.placeCamera(next.x, next.y, next.z, next.distance, next.polar, next.azimuth)
    const settled =
      Math.abs(goal.targetX - next.x) < 0.002 &&
      Math.abs(goal.targetZ - next.z) < 0.002 &&
      Math.abs(goal.distance - next.distance) < 0.004 &&
      (goal.polar === null || Math.abs(goal.polar - next.polar) < 0.002) &&
      (goal.azimuth === null || Math.abs(shortestAngle(next.azimuth, goal.azimuth)) < 0.002)
    if (settled) this.cameraGoal = null
    return true
  }

  // ---- Loop and input ------------------------------------------------------

  private startLoop(): void {
    const tick = (time: number) => {
      if (this.disposed) return
      const seconds = this.lastFrameTime ? Math.min((time - this.lastFrameTime) / 1000, 0.1) : 0.016
      this.lastFrameTime = time
      const ease = 1 - Math.exp(-EASE_RATE * seconds)
      let moved = this.stepUnits(ease, seconds)
      moved = this.stepCamera(ease) || moved
      moved = this.controls.update() || moved
      if (moved || this.needsRender) {
        this.positionDimensionLabels()
        this.renderer.render(this.scene, this.camera)
        this.needsRender = false
      }
      this.frameHandle = requestAnimationFrame(tick)
    }
    this.frameHandle = requestAnimationFrame(tick)
  }

  private stepUnits(ease: number, seconds: number): boolean {
    let moved = false
    for (const slot of this.units.values()) {
      const targetX = toMetres(slot.target.centre.x)
      const targetZ = toMetres(slot.target.centre.z)
      const holder = slot.holder
      const turn = shortestAngle(holder.rotation.y, slot.target.rotationY)
      const far = Math.abs(targetX - holder.position.x) > 0.0005 || Math.abs(targetZ - holder.position.z) > 0.0005 || Math.abs(turn) > 0.0005
      if (far) {
        const step = this.theme.reducedMotion ? 1 : ease
        holder.position.x += (targetX - holder.position.x) * step
        holder.position.z += (targetZ - holder.position.z) * step
        holder.rotation.y += turn * step
        moved = true
      }
      if (slot.arrival < 1) {
        slot.arrival = Math.min(1, slot.arrival + seconds / 0.3)
        const settle = 1 - Math.pow(1 - slot.arrival, 3)
        holder.position.y = (1 - settle) * 0.35
        holder.scale.setScalar(0.85 + 0.15 * settle)
        moved = true
      }
    }
    return moved
  }

  private attachListeners(): void {
    const onControlsStart = () => {
      this.userHasMovedCamera = true
      this.cameraGoal = null
    }
    this.controls.addEventListener('start', onControlsStart)
    this.removeListeners.push(() => this.controls.removeEventListener('start', onControlsStart))

    // A wheel or pinch zoom moves the camera inside the controls' own event
    // handler, not in the loop's update() - so by the time the loop asks whether
    // anything moved, the answer is already "no" and the zoom would sit undrawn
    // until the next drag. The controls announce every camera change, so draw on that.
    const onControlsChange = () => {
      this.needsRender = true
    }
    this.controls.addEventListener('change', onControlsChange)
    this.removeListeners.push(() => this.controls.removeEventListener('change', onControlsChange))

    const onPointerDown = (event: PointerEvent) => {
      this.pointerDown = { x: event.clientX, y: event.clientY }
    }
    const onPointerUp = (event: PointerEvent) => {
      const start = this.pointerDown
      this.pointerDown = null
      if (!start || Math.hypot(event.clientX - start.x, event.clientY - start.y) > CLICK_SLOP_PX) return
      this.pick(event)
    }
    const onPointerMove = (event: PointerEvent) => {
      if (this.pointerDown) return
      const hit = this.hitAt(event)
      if (hit && 'removeEntryId' in hit) {
        this.canvas.style.cursor = 'pointer'
        return
      }
      if (hit && 'entryId' in hit) {
        this.setHoveredEntry(hit.entryId)
        this.canvas.style.cursor = 'pointer'
        return
      }
      this.setHoveredEntry(null)
      this.canvas.style.cursor = hit ? 'pointer' : 'grab'
    }
    const onContextLost = (event: Event) => {
      event.preventDefault()
      this.callbacks.onContextLost()
    }
    this.canvas.addEventListener('pointerdown', onPointerDown)
    this.canvas.addEventListener('pointerup', onPointerUp)
    this.canvas.addEventListener('pointermove', onPointerMove)
    this.canvas.addEventListener('webglcontextlost', onContextLost)
    this.removeListeners.push(() => {
      this.canvas.removeEventListener('pointerdown', onPointerDown)
      this.canvas.removeEventListener('pointerup', onPointerUp)
      this.canvas.removeEventListener('pointermove', onPointerMove)
      this.canvas.removeEventListener('webglcontextlost', onContextLost)
    })
  }

  private hitAt(
    event: PointerEvent,
  ): { entryId: string } | { ghostKey: SpaceKey } | { removeEntryId: string } | null {
    const { three } = this
    const rect = this.canvas.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return null
    const pointer = new three.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1)
    const raycaster = new three.Raycaster()
    raycaster.setFromCamera(pointer, this.camera)
    // Outlines are for looking at, not for hitting. three's default line
    // threshold is a whole scene unit - a metre here - which made every ghost's
    // dashed outline catch taps meant for the unit beside it.
    raycaster.params.Line = { threshold: 0 }

    const holders = [...this.units.values()].map((slot) => slot.holder)
    const hits = raycaster
      .intersectObjects([...this.ghostGroup.children, ...holders], true)
      .filter((hit) => !(hit.object as Partial<Line>).isLine)
    // The "+" badge is drawn over everything, the remove badge included, so a tap
    // on it is a tap on it even where a unit or its remove badge sits behind;
    // then the remove badge; otherwise the nearest thing under the pointer wins.
    const badge = hits.find((hit) => (hit.object as Partial<Sprite>).isSprite && findUserData(hit.object, 'ghostKey'))
    const removeEntryId = badge ? null : hits.map((candidate) => findUserData(candidate.object, 'removeEntryId')).find((id) => typeof id === 'string')
    if (typeof removeEntryId === 'string') return { removeEntryId }
    const hit = badge ?? hits[0]
    if (!hit) return null
    const ghostKey = findUserData(hit.object, 'ghostKey')
    if (isSpaceKey(ghostKey)) return { ghostKey }
    const entryId = findUserData(hit.object, 'entryId')
    return typeof entryId === 'string' ? { entryId } : null
  }

  private pick(event: PointerEvent): void {
    const hit = this.hitAt(event)
    if (!hit) {
      this.callbacks.onSelectUnit(null)
      return
    }
    if ('removeEntryId' in hit) {
      this.callbacks.onRemoveUnit(hit.removeEntryId)
      this.setHoveredEntry(null)
      return
    }
    if ('ghostKey' in hit) this.callbacks.onPickGhost(hit.ghostKey)
    else this.callbacks.onSelectUnit(hit.entryId)
  }
}

function findUserData(object: Object3D | null, key: string): unknown {
  let current: Object3D | null = object
  while (current) {
    if (current.userData[key] !== undefined) return current.userData[key]
    current = current.parent
  }
  return null
}
