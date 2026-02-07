import { prompt, promptSecret, confirm } from '../src/utils/prompt.js'
import { createInterface } from 'node:readline'

vi.mock('node:readline', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    createInterface: vi.fn(),
    emitKeypressEvents: vi.fn()
  }
})

describe('prompt utils', () => {
  describe('prompt', () => {
    it('resolves with user input', async () => {
      const mockQuestion = vi.fn((q, cb) => cb('answer'))
      const mockClose = vi.fn()
      createInterface.mockReturnValue({
        question: mockQuestion,
        close: mockClose
      })

      const result = await prompt('Question? ')

      expect(result).toBe('answer')
      expect(mockQuestion).toHaveBeenCalledWith(
        'Question? ',
        expect.any(Function)
      )
      expect(mockClose).toHaveBeenCalled()
    })
  })

  describe('promptSecret', () => {
    let mockStdin
    let mockStdout

    beforeEach(() => {
      mockStdin = {
        isTTY: true,
        setRawMode: vi.fn(),
        resume: vi.fn(),
        setEncoding: vi.fn(),
        pause: vi.fn(),
        removeListener: vi.fn(),
        on: vi.fn()
      }
      mockStdout = {
        write: vi.fn()
      }

      vi.spyOn(process, 'stdin', 'get').mockReturnValue(mockStdin)
      vi.spyOn(process, 'stdout', 'get').mockReturnValue(mockStdout)
    })

    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('resolves with secret input on Enter', async () => {
      mockStdin.on.mockImplementation((event, handler) => {
        if (event === 'keypress') {
          // Simulate typing 'abc' then Enter
          handler('a', { name: 'a' })
          handler('b', { name: 'b' })
          handler('c', { name: 'c' })
          handler('\r', { name: 'return' })
        }
      })

      const result = await promptSecret('Secret: ')

      expect(result).toBe('abc')
      expect(mockStdout.write).toHaveBeenCalledWith('Secret: ')
      expect(mockStdout.write).toHaveBeenCalledWith('*') // Called 3 times
      expect(mockStdout.write).toHaveBeenCalledWith('\n')
      expect(mockStdout.write).toHaveBeenCalledWith('\n')
    })

    it('exits process on Ctrl+C', async () => {
      const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {})

      mockStdin.on.mockImplementation((event, handler) => {
        if (event === 'keypress') {
          handler('c', { name: 'c', ctrl: true })
        }
      })

      // We don't await because it should exit, but since we mocked exit, the promise won't resolve naturally.
      // However, promptSecret promise hangs if we don't resolve it.
      // But the code: cleanup(); stdout.write('\n'); process.exit()
      // Since we mock exit, the function finishes execution but the promise created in promptSecret is never resolved.
      // We can just rely on side effects before exit.

      // Use a race or just let it hang? Better: verify side effects.
      // Actually promptSecret returns a promise. If process.exit is mocked, it just hangs.
      // We can wrap it in a promise race or verify strictly synchronously? No, keypress is async event loop.
      // We'll trust the mockExit call.

      promptSecret('Secret: ')

      // Force the keypress via the mock implementation logic which we set up above
      // But wait: promptSecret attaches the listener synchronously.
      // We need to trigger the emission.

      // Actually mockStdin.on is called inside prompting.
      // We need to capture the handler to call it.
      let capturedHandler
      mockStdin.on.mockImplementation((event, handler) => {
        if (event === 'keypress') capturedHandler = handler
      })

      promptSecret('Secret: ')

      // Trigger Ctrl+C
      capturedHandler('c', { name: 'c', ctrl: true })

      expect(mockExit).toHaveBeenCalled()
      expect(mockStdout.write).toHaveBeenCalledWith('\n')
    })

    it('handles backspace correctly', async () => {
      mockStdin.on.mockImplementation((event, handler) => {
        if (event === 'keypress') {
          // Type 'a', then Backspace, then 'b', then Enter -> result 'b'
          handler('a', { name: 'a' })
          handler(undefined, { name: 'backspace' })
          handler('b', { name: 'b' })
          handler('\r', { name: 'return' })
        }
      })

      const result = await promptSecret('Secret: ')

      expect(result).toBe('b')
      expect(mockStdout.write).toHaveBeenCalledWith('\b \b')
    })

    it('ignores backspace on empty input', async () => {
      mockStdin.on.mockImplementation((event, handler) => {
        if (event === 'keypress') {
          // Backspace on empty -> nothing happens
          handler(undefined, { name: 'backspace' })
          handler('a', { name: 'a' })
          handler('\r', { name: 'return' })
        }
      })

      const result = await promptSecret('Secret: ')
      expect(result).toBe('a')
      // Should NOT have called write with backspace sequence
      expect(mockStdout.write).not.toHaveBeenCalledWith('\b \b')
    })

    it('handles non-TTY environment', async () => {
      // Setup non-TTY stdin
      mockStdin.isTTY = false

      mockStdin.on.mockImplementation((event, handler) => {
        if (event === 'keypress') {
          handler('a', { name: 'a' })
          handler('\r', { name: 'return' })
        }
      })

      const result = await promptSecret('Secret: ')
      expect(result).toBe('a')
      // verify setRawMode was NOT called
      expect(mockStdin.setRawMode).not.toHaveBeenCalled()
    })

    it('handles undefined key in handler', async () => {
      mockStdin.on.mockImplementation((event, handler) => {
        if (event === 'keypress') {
          // pass undefined for key
          handler('a', undefined)
          // then finish
          handler('\r', { name: 'return' })
        }
      })

      const result = await promptSecret('Secret: ')
      expect(result).toBe('a')
      expect(mockStdout.write).toHaveBeenCalledWith('*')
    })
  })

  describe('confirm', () => {
    it('returns true for y/yes', async () => {
      const mockQuestion = vi
        .fn()
        .mockImplementationOnce((q, cb) => cb('y'))
        .mockImplementationOnce((q, cb) => cb('yes'))
        .mockImplementationOnce((q, cb) => cb('Y'))

      const mockClose = vi.fn()
      createInterface.mockReturnValue({
        question: mockQuestion,
        close: mockClose
      })

      expect(await confirm('Sure?')).toBe(true)
      expect(await confirm('Sure?')).toBe(true)
      expect(await confirm('Sure?')).toBe(true)
    })

    it('returns false for others', async () => {
      const mockQuestion = vi
        .fn()
        .mockImplementationOnce((q, cb) => cb('n'))
        .mockImplementationOnce((q, cb) => cb('no'))
        .mockImplementationOnce((q, cb) => cb('other'))

      const mockClose = vi.fn()
      createInterface.mockReturnValue({
        question: mockQuestion,
        close: mockClose
      })

      expect(await confirm('Sure?')).toBe(false)
      expect(await confirm('Sure?')).toBe(false)
      expect(await confirm('Sure?')).toBe(false)
    })
  })
})
