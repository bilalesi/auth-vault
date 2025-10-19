import { NextRequest } from "next/server";
import { StatusCodes } from "http-status-codes";
import { validateRequest } from "@/lib/auth/validate-token";
import { getTaskDB } from "@/lib/task-manager/in-memory-db";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const { taskId } = await params;
    const validation = await validateRequest(request);

    if (!validation.valid || !validation.userId) {
      return Response.json(
        { error: "Unauthorized" },
        { status: StatusCodes.UNAUTHORIZED }
      );
    }

    const taskDB = getTaskDB();
    const task = taskDB.get(taskId);

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

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const { taskId } = await params;
    const validation = await validateRequest(request);

    if (!validation.valid || !validation.userId) {
      return Response.json(
        { error: "Unauthorized" },
        { status: StatusCodes.UNAUTHORIZED }
      );
    }

    const taskDB = getTaskDB();
    const task = taskDB.get(taskId);

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

    taskDB.delete(taskId);

    return Response.json({ message: "Task deleted successfully" });
  } catch (error) {
    console.error("Error deleting task:", error);
    return Response.json(
      { error: "Internal server error" },
      { status: StatusCodes.INTERNAL_SERVER_ERROR }
    );
  }
}
