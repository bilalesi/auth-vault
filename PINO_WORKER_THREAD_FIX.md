# Pino Worker Thread Fix

## Issue

Error when starting the dev server:

```
[Error: Cannot find module '/ROOT/node_modules/.pnpm/thread-stream@3.1.0/node_modules/thread-stream/lib/worker.js']
```

## Root Cause

Pino's `pino-pretty` transport uses worker threads which have issues with pnpm's nested node_modules structure. The worker thread can't resolve the module path correctly.

## Solution

Removed the transport configuration from the logger and output JSON logs by default. For pretty printing, pipe the output through pino-pretty externally.

## Changes Made

### 1. Updated Logger Configuration (`src/lib/logger/index.ts`)

**Before:**

```typescript
const logger = pino({
  level: logLevel,
  transport: isDevelopment
    ? {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "HH:MM:ss Z",
          ignore: "pid,hostname",
          singleLine: false,
        },
      }
    : undefined,
  // ... other config
});
```

**After:**

```typescript
const logger = pino({
  level: logLevel,
  // No transport - output JSON directly
  // ... other config
});
```

### 2. Added Pretty Print Script (`package.json`)

```json
{
  "scripts": {
    "dev": "next dev --turbopack",
    "dev:pretty": "next dev --turbopack 2>&1 | pnpm exec pino-pretty"
  }
}
```

## Usage

### Development (JSON logs)

```bash
pnpm dev
```

Output:

```json
{
  "level": 30,
  "time": "2025-10-19T12:34:56.789Z",
  "event": "auth.login",
  "userId": "user-123"
}
```

### Development (Pretty logs)

```bash
pnpm dev:pretty
```

Output:

```
[12:34:56 UTC] INFO: auth.login
    event: "auth.login"
    userId: "user-123"
```

### Production

```bash
pnpm start
```

Output: JSON logs (same as dev)

## Benefits of This Approach

1. **No Worker Thread Issues**: Avoids pnpm module resolution problems
2. **Simpler**: No complex transport configuration
3. **Flexible**: Choose JSON or pretty format at runtime
4. **Production Ready**: JSON logs work better with log aggregation tools
5. **Performance**: Slightly faster without transport overhead

## Alternative Solutions (Not Recommended)

### Option 1: Use npm instead of pnpm

```bash
npm install
npm run dev
```

### Option 2: Use pnpm shamefully-hoist

```bash
# .npmrc
shamefully-hoist=true
```

### Option 3: Use NODE_OPTIONS

```bash
NODE_OPTIONS="--experimental-loader=pino-pretty/loader" pnpm dev
```

## Testing

```bash
# Test JSON output
pnpm dev

# Test pretty output
pnpm dev:pretty

# Test in production mode
pnpm build
pnpm start
```

## References

- [Pino Transport Documentation](https://getpino.io/#/docs/transports)
- [pnpm Module Resolution](https://pnpm.io/how-peers-are-resolved)
- [Next.js Logging Best Practices](https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation)
