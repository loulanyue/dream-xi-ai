/**
 * Dream XI AI <-> Agent Control Bridge Example
 * Demonstrates how a Dream XI squad dispatches match tasks and reports
 * telemetry to the Agent Control Plane (http://localhost:8000).
 */

interface AgentControlTaskPayload {
  title: string;
  objective: string;
  priority: "critical" | "high" | "normal" | "low";
  source_type: string;
  external_id?: string;
}

export class AgentControlBridge {
  private baseUrl: string;

  constructor(baseUrl = "http://127.0.0.1:8000") {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  /**
   * Dispatch a Dream XI match task to Agent Control task queue
   */
  async dispatchMatchTask(
    formationName: string,
    goal: string,
    priority: "critical" | "high" | "normal" | "low" = "high",
  ) {
    const payload: AgentControlTaskPayload = {
      title: `[Dream XI] ${formationName} Match Run`,
      objective: goal,
      priority,
      source_type: "dream-xi",
      external_id: `MATCH_${Date.now()}`,
    };

    console.log(`[Bridge] Dispatching task to Agent Control: ${payload.title}`);
    const res = await fetch(`${this.baseUrl}/api/v1/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      throw new Error(`Failed to dispatch task: ${res.status} ${res.statusText}`);
    }

    const data = await res.json();
    console.log(`[Bridge] Task successfully queued! ID: ${data.id}, PublicID: ${data.public_id}`);
    return data;
  }

  /**
   * Query cluster metrics from Agent Control
   */
  async getMetrics() {
    const res = await fetch(`${this.baseUrl}/api/v1/dashboard/stats`);
    if (!res.ok) {
      throw new Error(`Failed to fetch metrics: ${res.statusText}`);
    }
    return res.json();
  }
}

// Quick CLI execution demonstration
if (import.meta.url === `file://${process.argv[1]}`) {
  const bridge = new AgentControlBridge();
  bridge
    .dispatchMatchTask("4-3-3 Full-Stack", "Build and peer-review high-throughput caching layer")
    .then((task) => {
      console.log("Match task dispatched to control plane:", task);
    })
    .catch((err) => {
      console.error("Bridge dispatch failed (ensure Agent Control is running):", err.message);
    });
}
