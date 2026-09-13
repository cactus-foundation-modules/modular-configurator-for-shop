// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { LayoutPlan } from '@/modules/modular-configurator-for-shop/components/public/LayoutPlan'
import { placeChain, type ChainEntry, type PieceDefinition } from '@/modules/modular-configurator-for-shop/lib/chain-geometry'

// The plan draws each unit from its own frame; these pin the ring outlines, since
// a wrong arc flag draws the curve bulging the wrong way with nothing failing.

beforeAll(() => {
  ;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

const HALF: PieceDefinition = { pieceId: 'half', shape: { kind: 'half-curve', back: 'outside', seatDepthMm: 710 }, widthMm: 2400, depthMm: 1200 }
const HALF_EITHER: PieceDefinition = { ...HALF, pieceId: 'half-either', shape: { kind: 'half-curve', back: 'none', seatDepthMm: 710 } }
const CURVE: PieceDefinition = { pieceId: 'curve', shape: { kind: 'curve', back: 'none', seatDepthMm: 710 }, widthMm: 1200, depthMm: 1200 }
const DEFINITIONS = new Map([HALF, HALF_EITHER, CURVE].map((definition) => [definition.pieceId, definition]))

let root: Root | null = null
let host: HTMLDivElement | null = null

afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
})

function drawnPaths(chain: ChainEntry[], className: string): string[] {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  act(() => root?.render(<LayoutPlan placed={placeChain(chain, DEFINITIONS)} labelFor={() => 'Unit'} description="Plan" />))
  return [...host.querySelectorAll(`path.${className}`)].map((path) => path.getAttribute('d') ?? '')
}

describe('drawing curved units on the plan', () => {
  it('draws a half curve as half a ring behind its straight side, round its far side', () => {
    // Ring centred on (0, 600) in the unit's frame: outer radius 1200, inner 490,
    // from the left cut end over the top (z -600) to the right one, clockwise on screen.
    expect(drawnPaths([{ entryId: 'e0', pieceId: 'half' }], 'mcf-plan-unit')).toEqual([
      'M -1200 600 A 1200 1200 0 0 1 0 -600 A 1200 1200 0 0 1 1200 600 L 490 600 A 490 490 0 0 0 0 110 A 490 490 0 0 0 -490 600 Z',
    ])
    expect(host?.querySelectorAll('path.mcf-plan-back')).toHaveLength(1)
  })

  it('draws a backless half curve laid the inside way bulging towards the front, with no back', () => {
    // Ring centred on (0, -600): from the left cut end under the bottom (z +600) to the right one.
    expect(drawnPaths([{ entryId: 'e0', pieceId: 'half-either', flipped: true }], 'mcf-plan-unit')).toEqual([
      'M -1200 -600 A 1200 1200 0 0 0 0 600 A 1200 1200 0 0 0 1200 -600 L 490 -600 A 490 490 0 0 1 0 -110 A 490 490 0 0 1 -490 -600 Z',
    ])
    expect(host?.querySelectorAll('path.mcf-plan-back')).toHaveLength(0)
  })

  it('still draws a quarter curve as one arc each side', () => {
    // Laid the usual way: ring centred on (-600, 600), from straight up round to the right.
    expect(drawnPaths([{ entryId: 'e0', pieceId: 'curve' }], 'mcf-plan-unit')).toEqual([
      'M -600 -600 A 1200 1200 0 0 1 600 600 L -110 600 A 490 490 0 0 0 -600 110 Z',
    ])
  })
})
