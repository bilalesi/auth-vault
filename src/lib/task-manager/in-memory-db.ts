/**
 * In-Memory Task Database
 * Simulates a task manager database for demonstration purposes
 */

export interface Task {
  id: string;
  name: string;
  description: string;
  status: "pending" | "running" | "completed" | "failed";
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  userId: string;
  offlineTokenId?: string;
  offlineTokenStatus?: "pending" | "active" | "failed";
  result?: string;
  error?: string;
  progress?: number;
}

class InMemoryTaskDB {
  private tasks: Map<string, Task> = new Map();

  create(task: Omit<Task, "id" | "createdAt" | "status">): Task {
    // Generate UUIDv4 for compatibility with auth manager
    const id = crypto.randomUUID();
    const newTask: Task = {
      ...task,
      id,
      status: "pending",
      createdAt: new Date(),
    };
    this.tasks.set(id, newTask);
    return newTask;
  }

  get(id: string): Task | undefined {
    return this.tasks.get(id);
  }

  update(id: string, updates: Partial<Task>): Task | undefined {
    const task = this.tasks.get(id);
    if (!task) return undefined;

    const updatedTask = { ...task, ...updates };
    this.tasks.set(id, updatedTask);
    return updatedTask;
  }

  delete(id: string): boolean {
    return this.tasks.delete(id);
  }

  getUserTasks(userId: string): Task[] {
    return Array.from(this.tasks.values()).filter(
      (task) => task.userId === userId
    );
  }

  getAll(): Task[] {
    return Array.from(this.tasks.values());
  }

  clear(): void {
    this.tasks.clear();
  }
}

// Singleton instance
let dbInstance: InMemoryTaskDB | null = null;

export function getTaskDB(): InMemoryTaskDB {
  if (!dbInstance) {
    dbInstance = new InMemoryTaskDB();
  }
  return dbInstance;
}
