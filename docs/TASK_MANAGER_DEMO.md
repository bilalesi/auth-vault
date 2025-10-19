# Task Manager Demo

A complete demonstration of the offline token flow with a beautiful task management interface.

## Features

### 1. Task Management UI (`/tasks`)

- Beautiful, modern interface with gradient background
- Create tasks with name and description
- View all your tasks in real-time
- Delete tasks
- Real-time progress tracking
- Status indicators with color coding

### 2. In-Memory Task Database

- Simulates a real task management system
- Stores task metadata: id, name, description, status, progress, etc.
- Links tasks to offline tokens
- Tracks token status (pending/active/failed)

### 3. Complete Offline Token Flow

The demo simulates the entire offline token lifecycle:

#### Step 1: Create Task

```
User creates a task → Task stored with status "pending"
```

#### Step 2: Request Offline Token

```
Click "Request Offline Token" →
  POST /api/auth/manager/offline-consent
    → Creates pending token in vault (gets persistent_token_id)
    → Returns consent URL
  → Redirects to Keycloak
```

#### Step 3: Grant Consent

```
User grants consent in Keycloak →
  Keycloak redirects to /api/auth/manager/offline-callback
    → Exchanges code for offline token
    → Stores encrypted token in vault with persistent_token_id
    → Updates vault: status = "active"
  → Redirects back to /tasks with persistent_token_id
```

#### Step 4: Link Token to Task

```
Frontend receives persistent_token_id →
  POST /api/tasks/{taskId}/link-persistent-id
    → Links persistent_token_id to task
    → Updates task: offlineTokenStatus = "pending" → "active"
```

#### Step 5: Execute Task

```
Click "Execute Task" →
  POST /api/tasks/{taskId}/execute
    → Retrieves persistent_token_id from task
    → Simulates expired access token scenario
    → Calls GET /api/auth/manager/access-token?id={persistent_token_id}
      → Retrieves encrypted refresh token from vault
      → Exchanges refresh token for new access token
      → Returns fresh access token
    → Uses access token to execute task
    → Updates task: status = "running"
    → Simulates work with progress updates
  → Task completes: status = "completed"
```

## API Endpoints

### Task Management

#### `GET /api/tasks`

Get all tasks for authenticated user

**Response:**

```json
{
  "tasks": [
    {
      "id": "task-123",
      "name": "Data Processing",
      "description": "Process large dataset",
      "status": "pending",
      "persistentTokenId": "550e8400-e29b-41d4-a716-446655440000",
      "offlineTokenStatus": "active",
      "progress": 0,
      "createdAt": "2025-01-18T12:00:00Z"
    }
  ]
}
```

#### `POST /api/tasks`

Create a new task

**Request:**

```json
{
  "name": "My Task",
  "description": "Task description"
}
```

#### `GET /api/tasks/{taskId}`

Get specific task details

#### `DELETE /api/tasks/{taskId}`

Delete a task

#### `POST /api/tasks/{taskId}/link-persistent-id`

Link a persistent token ID to a task

**Request:**

```json
{
  "persistentTokenId": "550e8400-e29b-41d4-a716-446655440000"
}
```

#### `POST /api/tasks/{taskId}/execute`

Execute a task using its offline token

**Responses:**

- `needs_consent`: Task needs offline token
- `waiting_consent`: Token pending user consent
- `executing`: Task is now running
- `token_failed`: Token request failed

## Task Status Flow

```
pending → (request token) → pending (no persistent_token_id)
                          ↓
                    (grant consent)
                          ↓
                    (link persistent_token_id)
                          ↓
                    pending (token: active)
                          ↓
                    (execute task)
                          ↓
                    (get access token via persistent_token_id)
                          ↓
                       running
                          ↓
                    (progress: 0-100%)
                          ↓
                      completed
```

## Task Execution Simulation

When a task is executed, it simulates the complete token refresh flow:

1. **Token Retrieval**: Uses persistent_token_id to get access token
2. **Token Refresh**: Simulates expired token → calls `/api/auth/manager/access-token`
3. **Start**: Task status → "running", progress → 0%
4. **Progress**: Updates every second, progress += 10%
5. **Complete**: After 10 seconds, status → "completed"
6. **Result**: Stores success message

```typescript
// Simulated execution with token refresh
persistent_token_id → refresh token → access token → execute task
                                                          ↓
0% → 10% → 20% → 30% → 40% → 50% → 60% → 70% → 80% → 90% → 100%
└─────────────────── 10 seconds ──────────────────────┘
```

## UI Features

### Status Badges

- **Pending**: Gray badge
- **Running**: Blue badge with progress bar
- **Completed**: Green badge with checkmark
- **Failed**: Red badge with error

### Token Status Badges

- **Pending**: Yellow badge (waiting for consent)
- **Active**: Green badge (ready to use)
- **Failed**: Red badge (needs retry)

### Progress Bar

- Animated blue bar
- Shows percentage
- Updates in real-time
- Smooth transitions

### Action Buttons

- **Request Offline Token**: Purple button (when no token)
- **Execute Task**: Green button (when token active)
- **Delete**: Red trash icon

## How to Use

### 1. Navigate to Tasks Page

```
http://localhost:3000/tasks
```

### 2. Create a Task

- Enter task name (e.g., "Data Processing Job")
- Enter description
- Click "Create Task"

### 3. Request Offline Token

- Click "🔐 Request Offline Token" on your task
- You'll be redirected to Keycloak
- Grant the `offline_access` permission
- You'll be redirected back to `/tasks`

### 4. Execute the Task

- Once token status shows "active"
- Click "▶️ Execute Task"
- Watch the progress bar fill up
- Task completes after 10 seconds

### 5. View Results

- Completed tasks show a green success message
- Failed tasks show a red error message
- All tasks show creation/completion timestamps

## Real-Time Updates

The page polls for updates every 2 seconds:

- Task status changes
- Progress updates
- Token status changes
- New tasks appear automatically

## Error Handling

### Token Not Found

```
Message: "Task needs offline token. Please request consent first."
Action: Click "Request Offline Token"
```

### Consent Pending

```
Message: "Waiting for user to grant consent"
Action: Complete the consent flow in Keycloak
```

### Token Failed

```
Message: "Token request failed. Please try again."
Action: Request a new token
```

### Task Execution Failed

```
Status: "failed"
Error: Displayed in red box
Action: Check logs or retry
```

## Database Schema

### Task Object

```typescript
interface Task {
  id: string; // Unique task ID
  name: string; // Task name
  description: string; // Task description
  status: "pending" | "running" | "completed" | "failed";
  createdAt: Date; // Creation timestamp
  startedAt?: Date; // Execution start time
  completedAt?: Date; // Completion time
  userId: string; // Owner user ID
  persistentTokenId?: string; // Linked persistent token ID (from vault)
  offlineTokenStatus?: "pending" | "active" | "failed";
  result?: string; // Success message
  error?: string; // Error message
  progress?: number; // 0-100
}
```

## Testing the Flow

### Test Scenario 1: Happy Path

```bash
# 1. Create task
curl -X POST http://localhost:3000/api/tasks \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Task","description":"Testing"}'

# 2. Request offline token (returns consent URL)
# Visit the URL in browser and grant consent

# 3. Execute task
curl -X POST http://localhost:3000/api/tasks/task-123/execute \
  -H "Authorization: Bearer $TOKEN"

# 4. Check progress
curl http://localhost:3000/api/tasks/task-123 \
  -H "Authorization: Bearer $TOKEN"
```

### Test Scenario 2: Without Token

```bash
# Try to execute without token
curl -X POST http://localhost:3000/api/tasks/task-123/execute \
  -H "Authorization: Bearer $TOKEN"

# Response: {"status": "needs_consent", ...}
```

### Test Scenario 3: Pending Token

```bash
# Request token but don't grant consent
# Try to execute
curl -X POST http://localhost:3000/api/tasks/task-123/execute \
  -H "Authorization: Bearer $TOKEN"

# Response: {"status": "waiting_consent", ...}
```

## Architecture

```
┌─────────────┐
│   Browser   │
│  /tasks UI  │
└──────┬──────┘
       │
       ├─── POST /api/tasks (create)
       │
       ├─── POST /api/auth/manager/offline-consent
       │    └─→ Creates pending token in vault
       │    └─→ Returns consent URL + persistent_token_id
       │
       ├─── [User grants consent in Keycloak]
       │
       ├─── GET /api/auth/manager/offline-callback
       │    └─→ Exchanges code for offline token
       │    └─→ Encrypts and stores token in vault
       │    └─→ Returns persistent_token_id
       │
       ├─── POST /api/tasks/{id}/link-persistent-id
       │    └─→ Links persistent_token_id to task
       │
       └─── POST /api/tasks/{id}/execute
            └─→ Retrieves persistent_token_id from task
            └─→ GET /api/auth/manager/access-token?id={persistent_token_id}
            │   └─→ Retrieves encrypted refresh token
            │   └─→ Exchanges for fresh access token
            └─→ Uses access token to execute task
            └─→ Updates progress
            └─→ Completes task
```

## Benefits

1. **Visual Feedback**: See the entire flow in action
2. **Real-Time Updates**: Progress bars and status changes
3. **Error Handling**: Clear error messages and recovery paths
4. **Complete Flow**: Demonstrates all aspects of offline tokens
5. **User-Friendly**: Beautiful UI with helpful instructions
6. **Realistic**: Simulates actual task execution patterns

## Next Steps

- Add task scheduling
- Implement task queues
- Add task dependencies
- Support multiple token types
- Add task logs/history
- Implement task cancellation
- Add task retry logic
- Support batch operations

## Key Implementation Details

### Persistent Token ID Flow

The demo uses `persistent_token_id` (the database ID from the token vault) instead of passing tokens directly:

1. **Token Creation**: When consent is granted, the offline token is encrypted and stored in the vault with a unique `persistent_token_id`
2. **Task Linking**: The `persistent_token_id` is linked to the task (not the actual token)
3. **Token Retrieval**: During task execution, the system uses the `persistent_token_id` to retrieve and refresh the access token
4. **Security**: The actual refresh token never leaves the vault - only the ID is stored with the task

### Access Token Refresh Simulation

The task execution simulates a real-world scenario where:

1. Task needs to execute → retrieves `persistent_token_id` from task
2. Calls `GET /api/auth/manager/access-token?id={persistent_token_id}`
3. The endpoint:
   - Retrieves the encrypted refresh token from vault
   - Decrypts it
   - Exchanges it with Keycloak for a fresh access token
   - Returns the new access token (expires in ~300 seconds)
4. Task uses the fresh access token to perform work
5. Progress updates simulate real task execution

This demonstrates how external services (like Jupyter or task managers) can use persistent token IDs to get fresh access tokens without storing sensitive refresh tokens.

### Why This Approach?

- **Security**: Refresh tokens are encrypted and never exposed
- **Scalability**: Multiple services can use the same persistent_token_id
- **Simplicity**: Services only need to store a UUID, not manage token encryption
- **Auditability**: All token usage is tracked in the vault
- **Flexibility**: Tokens can be revoked by deleting the vault entry
