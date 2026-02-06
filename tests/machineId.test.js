import { getMachineId } from '../src/utils/machineId.js'
import * as os from 'node:os'

vi.mock('node:os', () => ({
  hostname: vi.fn().mockReturnValue('mock-host'),
  platform: vi.fn().mockReturnValue('mock-platform'),
  arch: vi.fn().mockReturnValue('mock-arch'),
  userInfo: vi.fn().mockReturnValue({ username: 'mock-user' })
}))

describe('machineId.js', () => {
  it('should return a stable sha256 hash', () => {
    const id = getMachineId()
    // SHA256 of "mock-host|mock-platform|mock-arch|mock-user"
    expect(id).toBe(
      '49434ad100e605b15b2b94441ce84f24f77dcb57e25c7be09b40e136b4cd5ef8'
    )
  })

  it('should fallback on error', () => {
    vi.mocked(os.userInfo).mockImplementationOnce(() => {
      throw new Error('fail')
    })
    const id = getMachineId()
    expect(id).toContain('unknown-device-')
  })
})
