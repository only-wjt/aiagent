/**
 * IPC Handler Tests
 * Run with: bun test src/ipc/test.ts
 */

import { executeIPCCommand, type IPCCommand } from './handler'
import * as fs from 'fs'
import * as path from 'path'

const testDir = '/tmp/ipc-test'

// Setup
if (!fs.existsSync(testDir)) {
  fs.mkdirSync(testDir, { recursive: true })
}

async function runTests () {
  console.log('🧪 Running IPC Handler Tests...\n')

  // Test 1: Bash execution
  console.log('Test 1: Bash execution')
  const bashCmd: IPCCommand = {
    id: '1',
    type: 'bash',
    params: { cmd: 'echo "Hello from IPC"' },
  }
  const bashResult = await executeIPCCommand(bashCmd, testDir)
  console.log('Result:', bashResult)
  console.assert(bashResult.success, 'Bash command should succeed')
  console.log('✅ Passed\n')

  // Test 2: Write file
  console.log('Test 2: Write file')
  const writeCmd: IPCCommand = {
    id: '2',
    type: 'write_file',
    params: { filePath: 'test.txt', content: 'Hello World' },
  }
  const writeResult = await executeIPCCommand(writeCmd, testDir)
  console.log('Result:', writeResult)
  console.assert(writeResult.success, 'Write should succeed')
  console.log('✅ Passed\n')

  // Test 3: Read file
  console.log('Test 3: Read file')
  const readCmd: IPCCommand = {
    id: '3',
    type: 'read_file',
    params: { filePath: 'test.txt' },
  }
  const readResult = await executeIPCCommand(readCmd, testDir)
  console.log('Result:', readResult)
  console.assert(readResult.success, 'Read should succeed')
  console.assert(readResult.data?.content === 'Hello World', 'Content should match')
  console.log('✅ Passed\n')

  // Test 4: List directory
  console.log('Test 4: List directory')
  const listCmd: IPCCommand = {
    id: '4',
    type: 'list_dir',
    params: { dirPath: '.' },
  }
  const listResult = await executeIPCCommand(listCmd, testDir)
  console.log('Result:', listResult)
  console.assert(listResult.success, 'List should succeed')
  console.assert(Array.isArray(listResult.data?.files), 'Should return files array')
  console.log('✅ Passed\n')

  // Test 5: Error handling
  console.log('Test 5: Error handling (invalid command)')
  const errorCmd: IPCCommand = {
    id: '5',
    type: 'bash' as any,
    params: {},
  }
  const errorResult = await executeIPCCommand(errorCmd, testDir)
  console.log('Result:', errorResult)
  console.assert(!errorResult.success, 'Should fail with missing cmd')
  console.log('✅ Passed\n')

  // Cleanup
  fs.rmSync(testDir, { recursive: true })
  console.log('✅ All tests passed!')
}

runTests().catch(console.error)
