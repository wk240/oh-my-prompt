import { describe, expect, it } from 'vitest'
import { isPointInsideRect } from '../image-hover-button-manager'

describe('image hover button hit testing', () => {
  it('does not treat nearby container content as image hover', () => {
    const imageRect = {
      left: 100,
      top: 100,
      right: 300,
      bottom: 250,
      width: 200,
      height: 150,
    }

    expect(isPointInsideRect(120, 270, imageRect)).toBe(false)
  })

  it('keeps image overlays clickable when the pointer is inside the image rect', () => {
    const imageRect = {
      left: 100,
      top: 100,
      right: 300,
      bottom: 250,
      width: 200,
      height: 150,
    }

    expect(isPointInsideRect(120, 120, imageRect)).toBe(true)
  })
})
