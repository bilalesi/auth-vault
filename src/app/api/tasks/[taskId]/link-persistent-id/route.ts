import { NextRequest } from "next/server";
import { z } from "zod";
import { StatusCodes } from "http-status-codes";
import { validateRequest } from "@/lib/auth/validate-token";
import { getTaskDB } from "@/lib/task-manager/in-memory-db";

const LinkTokenSchema = z.object({
  persistentTokenId: z.uuid(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const { taskId } = await params;

    const taskDB = getTaskDB();
    const task = taskDB.get(taskId);

    if (!task) {
      return Response.json(
        { error: "Task not found" },
        { status: StatusCodes.NOT_FOUND }
      );
    }

    const body = await request.json();
    const { persistentTokenId } = LinkTokenSchema.parse(body);

    // Update task with persistent token ID
    const updatedTask = taskDB.update(task.id, {
      persistentTokenId,
      offlineTokenStatus: "active",
    });

    return Response.json({
      task: updatedTask,
      message: "Persistent token ID linked to task successfully",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(
        { error: "Invalid request", details: error.issues },
        { status: StatusCodes.BAD_REQUEST }
      );
    }

    console.error("Error linking persistent token ID to task:", error);
    return Response.json(
      { error: "Internal server error" },
      { status: StatusCodes.INTERNAL_SERVER_ERROR }
    );
  }
}
