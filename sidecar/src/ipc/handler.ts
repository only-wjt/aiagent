import { execSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'

export interface IPCCommand {
  id: string
  type: 'bash' | 'read_file' | 'write_file' | 'list_dir'
  params: Record<string, any>
}

export interface IPCResult {
  id: string
  success: boolean
  data?: any
  error?: string
}

export async function executeIPCCommand (command: IPCCommand, workspacePath: string): Promise<IPCResult> {
  try {
    switch (command.type) {
      case 'bash':
        return executeBash(command, workspacePath)
      case 'read_file':
        return readFile(command, workspacePath)
      case 'write_file':
        return writeFile(command, workspacePath)
      case 'list_dir':
        return listDir(command, workspacePath)
      default:
        return {
          id: command.id,
          success: false,
          error: `Unknown command type: ${command.type}`,
        }
    }
  } catch (error) {
    return {
      id: command.id,
      success: false,
      error: (error as Error).message,
    }
  }
}

function executeBash (command: IPCCommand, workspacePath: string): IPCResult {
  const { cmd, timeout = 30000 } = command.params
  if (!cmd) {
    return { id: command.id, success: false, error: 'Missing cmd parameter' }
  }

  try {
    const output = execSync(cmd, { timeout, encoding: 'utf-8', cwd: workspacePath })
    return {
      id: command.id,
      success: true,
      data: { output },
    }
  } catch (error) {
    return {
      id: command.id,
      success: false,
      error: (error as Error).message,
    }
  }
}

function readFile (command: IPCCommand, workspacePath: string): IPCResult {
  const { filePath } = command.params
  if (!filePath) {
    return { id: command.id, success: false, error: 'Missing filePath parameter' }
  }

  try {
    // 安全校验：禁止绝对路径和路径遍历
    if (path.isAbsolute(filePath) || filePath.includes('..')) {
      return { id: command.id, success: false, error: '不允许使用绝对路径或 ..' }
    }
    const fullPath = path.join(workspacePath, filePath)
    const content = fs.readFileSync(fullPath, 'utf-8')
    return {
      id: command.id,
      success: true,
      data: { content },
    }
  } catch (error) {
    return {
      id: command.id,
      success: false,
      error: (error as Error).message,
    }
  }
}

function writeFile (command: IPCCommand, workspacePath: string): IPCResult {
  const { filePath, content } = command.params
  if (!filePath || content === undefined) {
    return { id: command.id, success: false, error: 'Missing filePath or content parameter' }
  }

  try {
    // 安全校验：禁止绝对路径和路径遍历
    if (path.isAbsolute(filePath) || filePath.includes('..')) {
      return { id: command.id, success: false, error: '不允许使用绝对路径或 ..' }
    }
    const fullPath = path.join(workspacePath, filePath)
    fs.writeFileSync(fullPath, content, 'utf-8')
    return {
      id: command.id,
      success: true,
      data: { written: true },
    }
  } catch (error) {
    return {
      id: command.id,
      success: false,
      error: (error as Error).message,
    }
  }
}

function listDir (command: IPCCommand, workspacePath: string): IPCResult {
  const { dirPath = '.' } = command.params

  try {
    // 安全校验：禁止绝对路径，防止路径遍历
    if (path.isAbsolute(dirPath) || dirPath.includes('..')) {
      return { id: command.id, success: false, error: '不允许使用绝对路径或 ..' }
    }
    const fullPath = path.join(workspacePath, dirPath)
    const files = fs.readdirSync(fullPath)
    return {
      id: command.id,
      success: true,
      data: { files },
    }
  } catch (error) {
    return {
      id: command.id,
      success: false,
      error: (error as Error).message,
    }
  }
}
