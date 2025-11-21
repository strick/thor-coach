import type { Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { db } from "../db.js";

/**
 * Log a health event (sleep, migraine, etc.)
 */
export async function logHealthEvent(req: Request, res: Response) {
  try {
    const { date, category, intensity, duration_minutes, notes } = req.body;

    // Validate required fields
    if (!date || !category) {
      return res.status(400).json({
        error: "Missing required fields: date and category are required"
      });
    }

    // Validate category
    const validCategories = ['migraine', 'sleep', 'yardwork', 'run', 'other'];
    if (!validCategories.includes(category)) {
      return res.status(400).json({
        error: `Invalid category. Must be one of: ${validCategories.join(', ')}`
      });
    }

    // Validate intensity if provided
    if (intensity !== undefined && (intensity < 1 || intensity > 10)) {
      return res.status(400).json({
        error: "Intensity must be between 1 and 10"
      });
    }

    const id = randomUUID();
    const stmt = db.prepare(`
      INSERT INTO health_events (id, date, category, intensity, duration_minutes, notes)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(id, date, category, intensity || null, duration_minutes || null, notes || null);

    res.json({
      status: "logged",
      id,
      date,
      category,
      intensity,
      duration_minutes,
      notes
    });
  } catch (error) {
    console.error('Log health event error:', error);
    res.status(500).json({ error: "Failed to log health event" });
  }
}

/**
 * Get health events (by date or date range)
 */
export async function getHealthEvents(req: Request, res: Response) {
  try {
    const { date, from, to, category, limit = 50 } = req.query;

    let query = 'SELECT * FROM health_events WHERE 1=1';
    const params: any[] = [];

    if (date) {
      query += ' AND date = ?';
      params.push(date);
    } else if (from && to) {
      query += ' AND date BETWEEN ? AND ?';
      params.push(from, to);
    }

    if (category) {
      query += ' AND category = ?';
      params.push(category);
    }

    query += ' ORDER BY date DESC, created_at DESC LIMIT ?';
    params.push(Number(limit));

    const events = db.prepare(query).all(...params);

    res.json({
      events,
      count: events.length
    });
  } catch (error) {
    console.error('Get health events error:', error);
    res.status(500).json({ error: "Failed to get health events" });
  }
}

/**
 * Delete a health event
 */
export async function deleteHealthEvent(req: Request, res: Response) {
  try {
    const { eventId } = req.params;

    const stmt = db.prepare('DELETE FROM health_events WHERE id = ?');
    const result = stmt.run(eventId);

    if (result.changes === 0) {
      return res.status(404).json({ error: "Health event not found" });
    }

    res.json({ status: "deleted", eventId });
  } catch (error) {
    console.error('Delete health event error:', error);
    res.status(500).json({ error: "Failed to delete health event" });
  }
}
