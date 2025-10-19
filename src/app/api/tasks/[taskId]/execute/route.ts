import { NextRequest } from "next/server";
import { StatusCodes } from "http-status-codes";
import { getTaskDB } from "@/lib/task-manager/in-memory-db";
import { auth } from "@/auth";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const { taskId } = await params;
    const session = await auth();
    const taskDB = getTaskDB();
    const task = taskDB.get(taskId);

    if (!task) {
      return Response.json(
        { error: "Task not found" },
        { status: StatusCodes.NOT_FOUND }
      );
    }
    if (task.persistentTokenId) {
      taskDB.update(task.id, {
        status: "running",
        startedAt: new Date(),
        progress: 0,
        offlineTokenStatus: "active",
      });
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
  try {
    const tokenResponse = await fetch(
      `${process.env.NEXTAUTH_URL}/api/auth/manager/access-token?id=${persistentTokenId}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!tokenResponse.ok) {
      throw new Error(
        `Failed to get access token: ${tokenResponse.statusText}`
      );
    }

    let progress = 0;

    const interval = setInterval(() => {
      progress += 10;

      const task = taskDB.get(taskId);
      if (!task) {
        clearInterval(interval);
        return;
      }

      if (progress >= 100) {
        taskDB.update(taskId, {
          status: "completed",
          progress: 100,
          completedAt: new Date(),
          result: `Task "${task.name}" completed successfully! Used persistent_token_id to refresh access token and execute task.`,
        });
        clearInterval(interval);
        console.log(`[Task ${taskId}] Completed successfully`);
      } else {
        taskDB.update(taskId, { progress });
        console.log(`[Task ${taskId}] Progress: ${progress}%`);
      }
    }, 1000);
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
