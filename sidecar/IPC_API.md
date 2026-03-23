# IPC API Documentation

## Overview

The IPC (Inter-Process Communication) API allows the Rust layer to execute commands on the Node.js sidecar process. This enables seamless integration between Rust and JavaScript/TypeScript code.

## Endpoint

```
POST /api/ipc/execute
```

## Request Format

```json
{
  "id": "unique-command-id",
  "type": "bash|read_file|write_file|list_dir",
  "params": {
    // Command-specific parameters
  }
}
```

## Response Format

```json
{
  "id": "unique-command-id",
  "success": true,
  "data": {
    // Command-specific response data
  },
  "error": null
}
```

## Command Types

### 1. Bash Execution

Execute shell commands.

**Request:**
```json
{
  "id": "cmd-1",
  "type": "bash",
  "params": {
    "cmd": "ls -la",
    "timeout": 30000
  }
}
```

**Response:**
```json
{
  "id": "cmd-1",
  "success": true,
  "data": {
    "output": "total 48\ndrwxr-xr-x  5 user  staff  160 Mar 23 09:00 .\n..."
  }
}
```

**Parameters:**
- `cmd` (required): Shell command to execute
- `timeout` (optional): Timeout in milliseconds (default: 30000)

---

### 2. Read File

Read file contents.

**Request:**
```json
{
  "id": "cmd-2",
  "type": "read_file",
  "params": {
    "filePath": "src/index.ts"
  }
}
```

**Response:**
```json
{
  "id": "cmd-2",
  "success": true,
  "data": {
    "content": "import { ... }\n..."
  }
}
```

**Parameters:**
- `filePath` (required): Relative or absolute path to file

**Notes:**
- Relative paths are resolved from the workspace directory
- Absolute paths are used as-is

---

### 3. Write File

Write content to a file.

**Request:**
```json
{
  "id": "cmd-3",
  "type": "write_file",
  "params": {
    "filePath": "output.txt",
    "content": "Hello World"
  }
}
```

**Response:**
```json
{
  "id": "cmd-3",
  "success": true,
  "data": {
    "written": true
  }
}
```

**Parameters:**
- `filePath` (required): Relative or absolute path to file
- `content` (required): Content to write

**Notes:**
- Creates parent directories if they don't exist
- Overwrites existing files

---

### 4. List Directory

List files in a directory.

**Request:**
```json
{
  "id": "cmd-4",
  "type": "list_dir",
  "params": {
    "dirPath": "src"
  }
}
```

**Response:**
```json
{
  "id": "cmd-4",
  "success": true,
  "data": {
    "files": ["index.ts", "agent", "adapters", "ipc"]
  }
}
```

**Parameters:**
- `dirPath` (optional): Directory path (default: ".")

**Notes:**
- Returns only immediate children, not recursive
- Relative paths are resolved from the workspace directory

---

## Error Handling

All errors return a 400 status code with error details:

```json
{
  "id": "cmd-5",
  "success": false,
  "error": "ENOENT: no such file or directory, open '/path/to/missing/file'"
}
```

## Usage Examples

### From Rust

```rust
use reqwest::Client;
use serde_json::json;

let client = Client::new();
let response = client
    .post("http://localhost:31415/api/ipc/execute")
    .json(&json!({
        "id": "rust-cmd-1",
        "type": "bash",
        "params": {
            "cmd": "pwd"
        }
    }))
    .send()
    .await?;

let result = response.json::<serde_json::Value>().await?;
println!("Result: {}", result);
```

### From TypeScript

```typescript
const response = await fetch('http://localhost:31415/api/ipc/execute', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    id: 'ts-cmd-1',
    type: 'read_file',
    params: { filePath: 'package.json' }
  })
})

const result = await response.json()
console.log(result)
```

## Security Considerations

1. **Path Traversal**: File operations are restricted to the workspace directory by default
2. **Command Injection**: Use parameterized commands when possible
3. **Timeout Protection**: Bash commands have a 30-second timeout by default
4. **CORS**: IPC endpoint respects CORS headers

## Performance Notes

- Bash commands are synchronous and block the event loop
- For long-running operations, consider using background tasks
- File operations are buffered in memory
