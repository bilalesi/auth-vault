import { NextRequest } from "next/server";
import { StatusCodes } from "http-status-codes";
import { validateRequest } from "@/lib/auth/validate-token";
import { getTaskDB } from "@/lib/task-manager/in-memory-db";

/**
 * GET /api/tasks/[taskId]
 * Get a specific task
 */
export async function GET(
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

    return Response.json({ task });
  } catch (error) {
    console.error("Error fetching task:", error);
    return Response.json(
      { error: "Internal server error" },
      { status: StatusCodes.INTERNAL_SERVER_ERROR }
    );
  }
}

/**
 * DELETE /api/tasks/[taskId]
 * Delete a task
 */
export async function DELETE(
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

    taskDB.delete(params.taskId);

    return Response.json({ message: "Task deleted successfully" });
  } catch (error) {
    console.error("Error deleting task:", error);
    return Response.json(
      { error: "Internal server error" },
      { status: StatusCodes.INTERNAL_SERVER_ERROR }
    );
  }
}
