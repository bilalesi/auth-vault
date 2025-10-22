"use client";

import { Task } from "@/lib/task-manager/in-memory-db";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function TasksPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newTaskName, setNewTaskName] = useState("");
  const [newTaskDescription, setNewTaskDescription] = useState("");
  const [message, setMessage] = useState<{
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/");
    }
  }, [status, router]);

  useEffect(() => {
    if (session) {
      fetchTasks();
      // Poll for task updates every 2 seconds
      const interval = setInterval(fetchTasks, 2000);
      return () => clearInterval(interval);
    }
  }, [session]);

  const fetchTasks = async () => {
    try {
      const response = await fetch("/api/tasks", {
        headers: {
          Authorization: `Bearer ${session?.accessToken}`,
        },
        cache: "no-cache",
      });

      if (response.ok) {
        const data = await response.json();
        console.log("–– – fetchTasks – data––", data);
        setTasks(data.tasks);
      }
    } catch (error) {
      console.error("Error fetching tasks:", error);
    }
  };

  const createTask = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setMessage(null);

    try {
      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.accessToken}`,
        },
        body: JSON.stringify({
          name: newTaskName,
          description: newTaskDescription,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setMessage({ type: "success", text: data.message });
        setNewTaskName("");
        setNewTaskDescription("");
        fetchTasks();
      } else {
        const error = await response.json();
        setMessage({ type: "error", text: error.error });
      }
    } catch (error) {
      setMessage({ type: "error", text: "Failed to create task" });
    } finally {
      setCreating(false);
    }
  };

  const requestOfflineToken = async (taskId: string) => {
    setLoading(true);
    setMessage(null);

    try {
      const response = await fetch("/api/auth/manager/offline-consent", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.accessToken}`,
        },
        body: JSON.stringify({ taskId }),
      });

      if (response.ok) {
        const data = await response.json();
        console.log("–– – requestOfflineToken – data––", data);
        // Redirect to consent URL
        setTimeout(() => {
          window.location.href = data.consentUrl;
        }, 1000);
      } else {
        const error = await response.json();
        setMessage({ type: "error", text: error.error });
      }
    } catch (error) {
      setMessage({ type: "error", text: "Failed to request offline token" });
    } finally {
      setLoading(false);
    }
  };

  const executeTask = async (taskId: string) => {
    console.log("–– – executeTask – taskId––", taskId);
    setLoading(true);
    setMessage(null);

    try {
      const response = await fetch(`/api/tasks/${taskId}/execute`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session?.accessToken}`,
          "Content-Type": "application/json",
        },
      });

      const data = await response.json();

      return data;
    } catch (error) {
      console.log("–– – executeTask – error––", error);
      setMessage({ type: "error", text: "Failed to execute task" });
    } finally {
      setLoading(false);
    }
  };

  const deleteTask = async (taskId: string) => {
    if (!confirm("Are you sure you want to delete this task?")) return;

    try {
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${session?.accessToken}`,
        },
      });

      if (response.ok) {
        setMessage({ type: "success", text: "Task deleted successfully" });
        fetchTasks();
      }
    } catch (error) {
      setMessage({ type: "error", text: "Failed to delete task" });
    }
  };

  const getStatusColor = (status: Task["status"]) => {
    switch (status) {
      case "pending":
        return "bg-gray-100 text-gray-800";
      case "running":
        return "bg-blue-100 text-blue-800";
      case "completed":
        return "bg-green-100 text-green-800";
      case "failed":
        return "bg-red-100 text-red-800";
    }
  };

  const getTokenStatusColor = (status?: string) => {
    switch (status) {
      case "pending":
        return "bg-yellow-100 text-yellow-800";
      case "active":
        return "bg-green-100 text-green-800";
      case "failed":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xl">Loading...</div>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  return (
    <div className="min-h-screen h-full overflow-hidden bg-gradient-to-br bg-black py-4 px-4">
      <div className="max-w-7xl h-[calc(100vh-40px)] mx-auto  ">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white">Task Manager</h1>
          <p className="text-lg text-white">
            Create tasks and execute them with offline tokens
          </p>
        </div>

        {message && (
          <div
            className={`mb-6 p-4 rounded-lg ${
              message.type === "success"
                ? "bg-green-50 text-green-800 border border-green-200"
                : message.type === "error"
                ? "bg-red-50 text-red-800 border border-red-200"
                : "bg-blue-50 text-blue-800 border border-blue-200"
            }`}
          >
            {message.text}
          </div>
        )}
        <div className="flex gap-4 overflow-hidden relative h-full ">
          <div className="bg-white rounded-lg flex-2/5 shadow-lg p-6 sticky top-0 left-0 max-h-max">
            <h2 className="text-2xl font-semibold mb-4">Create New Task</h2>
            <form onSubmit={createTask} className="space-y-4 flex flex-col">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Task Name
                </label>
                <input
                  type="text"
                  value={newTaskName}
                  onChange={(e) => setNewTaskName(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="e.g., Data Processing Job"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Description
                </label>
                <textarea
                  value={newTaskDescription}
                  onChange={(e) => setNewTaskDescription(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Describe what this task does..."
                  rows={3}
                />
              </div>
              <button
                type="submit"
                disabled={creating}
                className="max-w-max ml-auto bg-black text-white py-3 px-6 rounded-lg hover:bg-black/90 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-medium"
              >
                {creating ? "Creating..." : "Create Task"}
              </button>
            </form>
          </div>

          <div className="flex flex-col gap-2 flex-3/5 overflow-y-auto h-full mr-3 pb-20">
            <h2 className="text-2xl text-white sticky top-0 left-0 font-semibold pr-3">
              Your Tasks
            </h2>
            <div className="flex flex-col gap-2 overflow-y-auto pr-3">
              {tasks.length === 0 ? (
                <div className="bg-white rounded-lg shadow-lg p-12 text-center">
                  <div className="text-6xl mb-4">📋</div>
                  <p className="text-gray-600 text-lg">
                    No tasks yet. Create your first task above!
                  </p>
                </div>
              ) : (
                tasks.map((task) => (
                  <div
                    key={task.id}
                    className="bg-white rounded-lg shadow-lg p-6 hover:shadow-xl transition-shadow"
                  >
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex-1">
                        <h3 className="text-xl font-semibold text-gray-900 mb-2">
                          {task.name}
                        </h3>
                        <p className="text-gray-600 mb-3">{task.description}</p>
                        <div className="flex items-center justify-between">
                          <div className="flex flex-wrap gap-2">
                            <span
                              className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(
                                task.status
                              )}`}
                            >
                              Status: {task.status}
                            </span>
                            {task.offlineTokenStatus && (
                              <span
                                className={`px-3 py-1 rounded-full text-sm font-medium ${getTokenStatusColor(
                                  task.offlineTokenStatus
                                )}`}
                              >
                                Token: {task.offlineTokenStatus}
                              </span>
                            )}
                          </div>
                          <div className="flex gap-3">
                            <button
                              onClick={() => requestOfflineToken(task.id)}
                              disabled={loading}
                              className="flex-1 bg-teal-500 text-white py-2 px-4 max-w-max rounded-lg hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                            >
                              Request Offline Token
                            </button>
                            <button
                              onClick={() => executeTask(task.id)}
                              disabled={loading}
                              className="flex-1 bg-teal-800 max-w-max text-white py-2 px-4 rounded-lg hover:bg-teal-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                            >
                              Execute Task
                            </button>
                            {task.offlineTokenStatus === "pending" && (
                              <div className="flex-1 bg-yellow-50 border border-yellow-200 text-yellow-800 py-2 px-4 rounded-lg text-center">
                                Waiting for consent...
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => deleteTask(task.id)}
                        className="text-red-600 hover:text-red-800 ml-4"
                        title="Delete task"
                      >
                        🗑️
                      </button>
                    </div>

                    {task.status === "running" &&
                      task.progress !== undefined && (
                        <div className="mb-4">
                          <div className="flex justify-between text-sm text-gray-600 mb-1">
                            <span>Progress</span>
                            <span>{task.progress}%</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-3">
                            <div
                              className="bg-blue-600 h-3 rounded-full transition-all duration-500"
                              style={{ width: `${task.progress}%` }}
                            />
                          </div>
                        </div>
                      )}

                    {task.result && (
                      <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                        <p className="text-sm text-green-800">
                          ✅ {task.result}
                        </p>
                      </div>
                    )}

                    {task.error && (
                      <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                        <p className="text-sm text-red-800">❌ {task.error}</p>
                      </div>
                    )}

                    <div className="mt-4 pt-4 border-t border-gray-200 text-sm text-gray-500">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          Created: {new Date(task.createdAt).toLocaleString()}
                        </div>
                        {task.completedAt && (
                          <div>
                            Completed:{" "}
                            {new Date(task.completedAt).toLocaleString()}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
