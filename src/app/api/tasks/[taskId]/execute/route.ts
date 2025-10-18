import { NextRequest } from "next/server";
import { StatusCodes } from "http-status-codes";
import { validateRequest } from "@/lib/auth/validate-token";
import { getTaskDB } from "@/lib/task-manager/in-memory-db";
import { GetStorage } from "@/lib/auth/token-vault-factory";
import { OfflineTokenStatusDict } from "@/lib/auth/token-vault-interface";

/**
 * POST /api/tasks/[taskId]/execute
 *
 * Simulates the complete offline token flow:
 * 1. Check if task has an offline token
 * 2. If not, return consent URL
 * 3. If yes, execute the task using the offline token
 * 4. Update task status and progress
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { taskId: string } }
) {
  try {
    const validation = await validateRequest(request);

    if (!validation.valid || !validation.userId) {
      return Response.json(
        { error: "Unauthorized" },
        { status: StatusCodes.UNAUTHORIZED }
      );
    }

    const taskDB = getTaskDB();
    const task = taskDB.get(params.taskId);

    if (!task) {
      return Response.json(
        { error: "Task not found" },
        { status: StatusCodes.NOT_FOUND }
      );
    }

    if (task.userId !== validation.userId) {
      return Response.json(
        { error: "Forbidden" },
        { status: StatusCodes.FORBIDDEN }
      );
    }

    // Check if task already has an offline token
    if (task.offlineTokenId) {
      // Check token status
      const vault = GetStorage();
      const tokenEntry = await vault.retrieve(task.offlineTokenId);

      if (!tokenEntry) {
        // Token not found, need to request new one
        return Response.json({
          status: "needs_consent",
          message: "Offline token not found. Please request consent.",
          taskId: task.id,
        });
      }

      if (tokenEntry.status === OfflineTokenStatusDict.Pending) {
        // Token is pending, waiting for user consent
        return Response.json({
          status: "waiting_consent",
          message: "Waiting for user to grant consent",
          taskId: task.id,
          offlineTokenId: task.offlineTokenId,
          offlineTokenStatus: tokenEntry.status,
        });
      }

      if (tokenEntry.status === OfflineTokenStatusDict.Failed) {
        // Token request failed
        taskDB.update(task.id, {
          status: "failed",
          error: "Offline token request failed",
          offlineTokenStatus: "failed",
        });

        return Response.json({
          status: "token_failed",
          message: "Offline token request failed. Please try again.",
          taskId: task.id,
        });
      }

      if (tokenEntry.status === OfflineTokenStatusDict.Active) {
        // Token is active, execute the task
        taskDB.update(task.id, {
          status: "running",
          startedAt: new Date(),
          progress: 0,
          offlineTokenStatus: "active",
        });

        // Simulate task execution in background
        simulateTaskExecution(task.id);

        return Response.json({
          status: "executing",
          message: "Task is now executing with offline token",
          taskId: task.id,
          offlineTokenId: task.offlineTokenId,
        });
      }
    }

    // No offline token, need to request consent
    return Response.json({
      status: "needs_consent",
      message: "Task needs offline token. Please request consent first.",
      taskId: task.id,
    });
  } catch (error) {
    console.error("Error executing task:", error);
    return Response.json(
      { error: "Internal server error" },
      { status: StatusCodes.INTERNAL_SERVER_ERROR }
    );
  }
}

/**
 * Simulate task execution with progress updates
 */
function simulateTaskExecution(taskId: string) {
  const taskDB = getTaskDB();
  let progress = 0;

  const interval = setInterval(() => {
    progress += 10;

    const task = taskDB.get(taskId);
    if (!task) {
      clearInterval(interval);
      return;
    }

    if (progress >= 100) {
      // Task completed
      taskDB.update(taskId, {
        status: "completed",
        progress: 100,
        completedAt: new Date(),
        result: `Task "${task.name}" completed successfully! Processed data using offline token.`,
      });
      clearInterval(interval);
      console.log(`Task ${taskId} completed`);
    } else {
      // Update progress
      taskDB.update(taskId, { progress });
      console.log(`Task ${taskId} progress: ${progress}%`);
    }
  }, 1000); // Update every second
}
