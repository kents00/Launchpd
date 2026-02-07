import { generateSubdomain } from '../src/utils/id.js'

describe('id utils', () => {
  describe('generateSubdomain', () => {
    it('generates a 12-character string', () => {
      const id = generateSubdomain()
      expect(id).toHaveLength(12)
    })

    it('contains only lowercase alphanumeric characters', () => {
      const id = generateSubdomain()
      expect(id).toMatch(/^[a-z0-9]+$/)
    })

    it('generates unique IDs', () => {
      const ids = new Set()
      for (let i = 0; i < 100; i++) {
        ids.add(generateSubdomain())
      }
      expect(ids.size).toBe(100)
    })
  })
})
