import { NextRequest } from "next/server";
import { z } from "zod";
import { StatusCodes } from "http-status-codes";
import { validateRequest } from "@/lib/auth/validate-token";
import { getTaskDB } from "@/lib/task-manager/in-memory-db";

const LinkTokenSchema = z.object({
  offlineTokenId: z.string().uuid(),
});

/**
 * POST /api/tasks/[taskId]/link-token
 * Link an offline token to a task
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

    const body = await request.json();
    const { offlineTokenId } = LinkTokenSchema.parse(body);

    // Update task with offline token ID
    const updatedTask = taskDB.update(task.id, {
      offlineTokenId,
      offlineTokenStatus: "pending",
    });

    return Response.json({
      task: updatedTask,
      message: "Offline token linked to task successfully",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(
        { error: "Invalid request", details: error.issues },
        { status: StatusCodes.BAD_REQUEST }
      );
    }

    console.error("Error linking token to task:", error);
    return Response.json(
      { error: "Internal server error" },
      { status: StatusCodes.INTERNAL_SERVER_ERROR }
    );
  }
}
