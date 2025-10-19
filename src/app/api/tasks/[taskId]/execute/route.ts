import { NextRequest } from "next/server";
import { StatusCodes } from "http-status-codes";
import { getTaskDB } from "@/lib/task-manager/in-memory-db";
import { auth } from "@/auth";

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
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const { taskId } = await params;
    const session = await auth();
    const taskDB = getTaskDB();
    console.log("taskId", taskId, "\n", "———taskDB", taskDB.getAll());
    console.log(
      "——session",
      session,
      session?.persistentTokenId,
      session?.user.id
    );
    const task = taskDB.get(taskId);

    if (!task) {
      return Response.json(
        { error: "Task not found" },
        { status: StatusCodes.NOT_FOUND }
      );
    }

    // Check if task has a persistent token ID
    if (task.persistentTokenId) {
      // Token is linked, execute the task
      // The access-token endpoint will handle token retrieval and refresh
      taskDB.update(task.id, {
        status: "running",
        startedAt: new Date(),
        progress: 0,
        offlineTokenStatus: "active",
      });

      // Simulate task execution in background with token refresh
      simulateTaskExecution(
        task.id,
        task.persistentTokenId,
        session?.accessToken!
      );

      return Response.json({
        status: "executing",
        message: "Task is now executing with offline token",
        taskId: task.id,
        persistentTokenId: task.persistentTokenId,
      });
    }

    // No persistent token ID, need to request consent
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

async function simulateTaskExecution(
  taskId: string,
  persistentTokenId: string,
  accessToken: string
) {
  const taskDB = getTaskDB();

  // Simulate getting access token using persistent token ID
  console.log(
    `[Task ${taskId}] Simulating access token retrieval using persistent_token_id: ${persistentTokenId}`
  );

  try {
    // Simulate calling the access token endpoint
    const accessTokenUrl = `${process.env.NEXTAUTH_URL}/api/auth/manager/access-token?id=${persistentTokenId}`;
    console.log(
      `[Task ${taskId}] Fetching access token from: ${accessTokenUrl}`
    );

    const tokenResponse = await fetch(accessTokenUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!tokenResponse.ok) {
      throw new Error(
        `Failed to get access token: ${tokenResponse.statusText}`
      );
    }

    const tokenData = await tokenResponse.json();
    console.log(
      `[Task ${taskId}] Successfully retrieved access token (expires in ${tokenData.expiresIn}s)`
    );

    // Now simulate task execution with the access token
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
          result: `Task "${task.name}" completed successfully! Used persistent_token_id to refresh access token and execute task.`,
        });
        clearInterval(interval);
        console.log(`[Task ${taskId}] Completed successfully`);
      } else {
        // Update progress
        taskDB.update(taskId, { progress });
        console.log(`[Task ${taskId}] Progress: ${progress}%`);
      }
    }, 1000); // Update every second
  } catch (error) {
    console.error(`[Task ${taskId}] Execution failed:`, error);
    taskDB.update(taskId, {
      status: "failed",
      error: `Failed to execute task: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    });
  }
}
