# Task Execution Flow Update

## Summary

Updated the task manager demo to properly simulate the complete offline token flow using `persistent_token_id` and access token refresh.

## Changes Made

### 1. TASK_MANAGER_DEMO.md

Updated documentation to reflect the correct flow:

- **Step 2**: Request offline token creates pending token in vault
- **Step 3**: Consent callback stores encrypted token and returns `persistent_token_id`
- **Step 4**: Link `persistent_token_id` to task
- **Step 5**: Execute task using `persistent_token_id` to get fresh access token

### 2. Task Database Schema (`src/lib/task-manager/in-memory-db.ts`)

Changed field name:

```typescript
// Before
offlineTokenId?: string;

// After
persistentTokenId?: string; // ID from token vault (persistent_token_id)
```

### 3. Link Token Route (`src/app/api/tasks/[taskId]/link-persistent-id/route.ts`)

Updated to use `persistentTokenId`:

```typescript
const LinkTokenSchema = z.object({
  persistentTokenId: z.uuid(), // Changed from offlineTokenId
});
```

### 4. Task Execution Route (`src/app/api/tasks/[taskId]/execute/route.ts`)

Major updates:

#### Changed References

- `task.offlineTokenId` → `task.persistentTokenId`
- All responses now return `persistentTokenId` instead of `offlineTokenId`

#### Enhanced Simulation Function

```typescript
async function simulateTaskExecution(taskId: string, persistentTokenId: string);
```

Now simulates the complete flow:

1. Logs the persistent_token_id being used
2. Calls `GET /api/auth/manager/access-token?id={persistentTokenId}`
3. Retrieves fresh access token
4. Logs token expiration time
5. Executes task with progress updates
6. Handles errors if token refresh fails

## Flow Diagram

```
User Creates Task
       ↓
Request Offline Token (POST /api/auth/manager/offline-consent)
       ↓
Keycloak Consent Screen
       ↓
Callback (GET /api/auth/manager/offline-callback)
       ↓
Store Encrypted Token → Returns persistent_token_id
       ↓
Link persistent_token_id to Task (POST /api/tasks/{id}/link-persistent-id)
       ↓
Execute Task (POST /api/tasks/{id}/execute)
       ↓
Get Access Token (GET /api/auth/manager/access-token?id={persistent_token_id})
       ↓
Refresh Token → Access Token
       ↓
Execute Task with Fresh Access Token
       ↓
Progress Updates (0% → 100%)
       ↓
Task Complete
```

## Key Benefits

1. **Realistic Simulation**: Demonstrates actual token refresh flow
2. **Security**: Shows how persistent_token_id keeps tokens secure
3. **Logging**: Console logs show each step of the process
4. **Error Handling**: Properly handles token refresh failures
5. **Documentation**: Clear explanation of the flow

## Testing

To test the updated flow:

1. Create a task at `/tasks`
2. Click "Request Offline Token"
3. Grant consent in Keycloak
4. Observe the persistent_token_id being linked
5. Click "Execute Task"
6. Check console logs to see:
   ```
   [Task task-123] Simulating access token retrieval using persistent_token_id: 550e8400-...
   [Task task-123] Fetching access token from: http://localhost:3000/api/auth/manager/access-token?id=550e8400-...
   [Task task-123] Successfully retrieved access token (expires in 300s)
   [Task task-123] Progress: 10%
   [Task task-123] Progress: 20%
   ...
   [Task task-123] Completed successfully
   ```

## Next Steps

- Update frontend UI to display persistent_token_id
- Add token refresh count to task metadata
- Show access token expiration time in UI
- Add manual token refresh button for testing
