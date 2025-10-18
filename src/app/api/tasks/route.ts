import { NextRequest } from "next/server";
import { z } from "zod";
import { StatusCodes } from "http-status-codes";
import { validateRequest } from "@/lib/auth/validate-token";
import { getTaskDB } from "@/lib/task-manager/in-memory-db";

const CreateTaskSchema = z.object({
  name: z.string().min(1),
  description: z.string(),
});

/**
 * GET /api/tasks
 * Get all tasks for the authenticated user
 */
export async function GET(request: NextRequest) {
  try {
    const validation = await validateRequest(request);

    if (!validation.valid || !validation.userId) {
      return Response.json(
        { error: "Unauthorized" },
        { status: StatusCodes.UNAUTHORIZED }
      );
    }

    const taskDB = getTaskDB();
    const tasks = taskDB.getUserTasks(validation.userId);

    return Response.json({ tasks });
  } catch (error) {
    console.error("Error fetching tasks:", error);
    return Response.json(
      { error: "Internal server error" },
      { status: StatusCodes.INTERNAL_SERVER_ERROR }
    );
  }
}

/**
 * POST /api/tasks
 * Create a new task
 */
export async function POST(request: NextRequest) {
  try {
    const validation = await validateRequest(request);

    if (!validation.valid || !validation.userId) {
      return Response.json(
        { error: "Unauthorized" },
        { status: StatusCodes.UNAUTHORIZED }
      );
    }

    const body = await request.json();
    const { name, description } = CreateTaskSchema.parse(body);

    const taskDB = getTaskDB();
    const task = taskDB.create({
      name,
      description,
      userId: validation.userId,
    });

    return Response.json(
      { task, message: "Task created successfully" },
      { status: StatusCodes.CREATED }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(
        { error: "Invalid request", details: error.issues },
        { status: StatusCodes.BAD_REQUEST }
      );
    }

    console.error("Error creating task:", error);
    return Response.json(
      { error: "Internal server error" },
      { status: StatusCodes.INTERNAL_SERVER_ERROR }
    );
  }
}
