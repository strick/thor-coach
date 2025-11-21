/**
 * Unified API client for Thor MCP server
 * Combines workout and health event functionality
 */

const API_BASE = process.env.THOR_API_URL || "http://localhost:3000";

export class HealthApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = API_BASE) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  // ==================== HEALTH EVENTS ====================

  /**
   * Log a health event (sleep, migraine, etc.)
   */
  async logHealthEvent(
    date: string,
    category: string,
    intensity?: number,
    duration_minutes?: number,
    notes?: string
  ): Promise<any> {
    const response = await fetch(`${this.baseUrl}/api/health-events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, category, intensity, duration_minutes, notes }),
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Get health events with optional filtering
   */
  async getHealthEvents(params?: {
    date?: string;
    from?: string;
    to?: string;
    category?: string;
    limit?: number;
  }): Promise<any> {
    const queryParams = new URLSearchParams();

    if (params?.date) queryParams.append('date', params.date);
    if (params?.from) queryParams.append('from', params.from);
    if (params?.to) queryParams.append('to', params.to);
    if (params?.category) queryParams.append('category', params.category);
    if (params?.limit) queryParams.append('limit', params.limit.toString());

    const url = `${this.baseUrl}/api/health-events${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`API error: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Delete a health event
   */
  async deleteHealthEvent(eventId: string): Promise<any> {
    const response = await fetch(`${this.baseUrl}/api/health-events/${eventId}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.statusText}`);
    }

    return response.json();
  }

  // ==================== WORKOUTS ====================

  /**
   * Log a workout using natural language
   */
  async logWorkout(text: string, date?: string): Promise<any> {
    const response = await fetch(`${this.baseUrl}/api/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, date }),
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Get exercises for a specific day of week
   */
  async getDayExercises(dayOfWeek: number): Promise<any> {
    const response = await fetch(`${this.baseUrl}/api/day/${dayOfWeek}`);

    if (!response.ok) {
      throw new Error(`API error: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Get progress summary for date range
   */
  async getProgressSummary(from: string, to: string): Promise<any> {
    const response = await fetch(
      `${this.baseUrl}/api/progress/summary?from=${from}&to=${to}`
    );

    if (!response.ok) {
      throw new Error(`API error: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Get weekly summaries
   */
  async getWeeklySummaries(limit: number = 10): Promise<any> {
    const response = await fetch(
      `${this.baseUrl}/api/weekly-summaries?limit=${limit}`
    );

    if (!response.ok) {
      throw new Error(`API error: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Get workouts for a specific date
   */
  async getWorkoutsByDate(date: string): Promise<any> {
    const response = await fetch(
      `${this.baseUrl}/api/workouts?date=${date}`
    );

    if (!response.ok) {
      throw new Error(`API error: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Get all exercises
   */
  async getExercises(dayOfWeek?: number): Promise<any> {
    const url = dayOfWeek
      ? `${this.baseUrl}/api/exercises?dow=${dayOfWeek}`
      : `${this.baseUrl}/api/exercises`;

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`API error: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Get exercise history
   */
  async getExerciseHistory(exerciseId: string, limit: number = 50): Promise<any> {
    const response = await fetch(
      `${this.baseUrl}/api/exercises/${exerciseId}/history?limit=${limit}`
    );

    if (!response.ok) {
      throw new Error(`API error: ${response.statusText}`);
    }

    return response.json();
  }

  // ==================== HEALTH CHECK ====================

  /**
   * Health check
   */
  async health(): Promise<any> {
    const response = await fetch(`${this.baseUrl}/health`);

    if (!response.ok) {
      throw new Error(`API error: ${response.statusText}`);
    }

    return response.json();
  }
}
