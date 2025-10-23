import { NextRequest } from "next/server";
import { z } from "zod";
import { StatusCodes } from "http-status-codes";
import { validateRequest } from "@/services/auth-manager/auth/validate-token";
import { getTaskDB } from "@/lib/task-manager/in-memory-db";

const CreateTaskSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const validation = await validateRequest(request);

    if (!validation.valid) {
      return Response.json(
        { error: "Unauthorized" },
        { status: StatusCodes.UNAUTHORIZED }
      );
    }

    const taskDB = getTaskDB();
    const tasks = taskDB.getUserTasks(validation.userId);

    return Response.json({ tasks });
  } catch (err) {
    return Response.json(
      { error: "Internal server error" },
      { status: StatusCodes.INTERNAL_SERVER_ERROR }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const validation = await validateRequest(request);

    if (!validation.valid) {
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
  } catch (err) {
    if (err instanceof z.ZodError) {
      return Response.json(
        { error: "Invalid request", details: err.issues },
        { status: StatusCodes.BAD_REQUEST }
      );
    }

    return Response.json(
      { error: "Internal server error" },
      { status: StatusCodes.INTERNAL_SERVER_ERROR }
    );
  }
}
