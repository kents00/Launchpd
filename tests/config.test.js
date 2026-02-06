import { config } from '../src/config.js'

describe('config', () => {
  it('has the correct domain', () => {
    expect(config.domain).toBe('launchpd.cloud')
  })

  it('has the correct API URL', () => {
    expect(config.apiUrl).toBe('https://api.launchpd.cloud')
  })

  it('has a version string', () => {
    expect(config.version).toMatch(/^\d+\.\d+\.\d+$/)
  })

  it('API URL uses HTTPS', () => {
    expect(config.apiUrl).toMatch(/^https:\/\//)
  })
})
