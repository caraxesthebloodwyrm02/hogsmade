// core/activity-tracker.js — Real-time activity monitoring for Glimpse
// Tracks engine usage, performance metrics, and generates visual feedback

import { writeFileSync, readFileSync, existsSync } from "fs";
import { bar, icon } from "./display.js";

export class ActivityTracker {
  constructor(config = {}) {
    this.dataPath = config.dataPath || ".glimpse-activity.json";
    this.maxEntries = config.maxEntries || 1000;
    this.updateInterval = config.updateInterval || 5000; // 5 seconds
    this.isRunning = false;
    this.intervalId = null;

    this.metrics = {
      totalSessions: 0,
      totalProcessingTime: 0,
      avgProcessingTime: 0,
      activeStreak: 0,
      lastActivity: null,
      dailyActivity: new Map(),
      hourlyActivity: new Map(),
      errorCount: 0,
      successCount: 0,
    };

    this.loadActivityData();
  }

  // Load existing activity data
  loadActivityData() {
    try {
      if (existsSync(this.dataPath)) {
        const data = JSON.parse(readFileSync(this.dataPath, "utf8"));
        this.metrics = {
          ...this.metrics,
          ...data.metrics,
          dailyActivity: new Map(Object.entries(data.metrics?.dailyActivity || {})),
          hourlyActivity: new Map(Object.entries(data.metrics?.hourlyActivity || {})),
        };
        this.sessions = data.sessions || [];
      } else {
        this.sessions = [];
      }
    } catch (error) {
      console.warn("Failed to load activity data:", error.message);
      this.sessions = [];
    }
  }

  // Save activity data to disk
  saveActivityData() {
    try {
      const data = {
        metrics: this.metrics,
        sessions: this.sessions.slice(-this.maxEntries),
        lastUpdated: new Date().toISOString(),
      };
      writeFileSync(this.dataPath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.warn("Failed to save activity data:", error.message);
    }
  }

  // Record a new session/activity
  recordSession(sessionData) {
    const session = {
      id: `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      duration: sessionData.duration || 0,
      recordCount: sessionData.recordCount || 0,
      complexity: sessionData.complexity || "unknown",
      confidence: sessionData.confidence || 0,
      scenario: sessionData.scenario || "custom",
      status: sessionData.status || "success",
      error: sessionData.error || null,
      ...sessionData,
    };

    this.sessions.push(session);
    this.updateMetrics(session);
    this.saveActivityData();

    return session;
  }

  // Update aggregate metrics
  updateMetrics(session) {
    this.metrics.totalSessions++;

    if (session.status === "success") {
      this.metrics.successCount++;
      this.metrics.totalProcessingTime += session.duration;
      this.metrics.avgProcessingTime = this.metrics.totalProcessingTime / this.metrics.successCount;
    } else {
      this.metrics.errorCount++;
    }

    // Update daily activity
    const dateKey = new Date(session.timestamp).toISOString().split("T")[0];
    this.metrics.dailyActivity.set(dateKey, (this.metrics.dailyActivity.get(dateKey) || 0) + 1);

    // Update hourly activity
    const hourKey = new Date(session.timestamp).getHours();
    this.metrics.hourlyActivity.set(hourKey, (this.metrics.hourlyActivity.get(hourKey) || 0) + 1);

    // Update streak
    this.updateStreak(session.timestamp);

    this.metrics.lastActivity = session.timestamp;
  }

  // Calculate activity streak
  updateStreak(timestamp) {
    const today = new Date().toISOString().split("T")[0];
    const sessionDate = new Date(timestamp).toISOString().split("T")[0];

    if (sessionDate === today) {
      this.metrics.activeStreak++;
    } else {
      const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
      if (sessionDate === yesterday) {
        // Continue streak
      } else {
        // Reset streak
        this.metrics.activeStreak = 1;
      }
    }
  }

  // Generate heatmap data for calendar view
  generateHeatmapData(days = 365) {
    const heatmap = [];
    const today = new Date();

    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateKey = date.toISOString().split("T")[0];
      const activity = this.metrics.dailyActivity.get(dateKey) || 0;

      heatmap.push({
        date: dateKey,
        activity,
        intensity: this.calculateIntensity(activity),
      });
    }

    return heatmap;
  }

  // Calculate intensity for heatmap coloring
  calculateIntensity(activity) {
    if (activity === 0) return 0;
    if (activity <= 2) return 1;
    if (activity <= 5) return 2;
    if (activity <= 10) return 3;
    return 4;
  }

  // Generate traffic data for real-time visualization
  generateTrafficData(hours = 24) {
    const traffic = [];
    const now = new Date();

    for (let i = hours - 1; i >= 0; i--) {
      const hour = new Date(now);
      hour.setHours(hour.getHours() - i);
      const hourKey = hour.getHours();
      const activity = this.metrics.hourlyActivity.get(hourKey) || 0;

      traffic.push({
        hour: hour.toISOString(),
        activity,
        label: hour.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
      });
    }

    return traffic;
  }

  // Get performance metrics
  getPerformanceMetrics() {
    const recentSessions = this.sessions.slice(-10);
    const recentAvg =
      recentSessions.length > 0
        ? recentSessions.reduce((sum, s) => sum + (s.duration || 0), 0) / recentSessions.length
        : 0;

    return {
      avgProcessingTime: this.metrics.avgProcessingTime,
      recentAvgProcessingTime: recentAvg,
      successRate:
        this.metrics.totalSessions > 0
          ? ((this.metrics.successCount / this.metrics.totalSessions) * 100).toFixed(1)
          : 0,
      totalSessions: this.metrics.totalSessions,
      activeStreak: this.metrics.activeStreak,
      lastActivity: this.metrics.lastActivity,
    };
  }

  // Start real-time monitoring
  startMonitoring() {
    if (this.isRunning) return;

    this.isRunning = true;
    this.intervalId = setInterval(() => {
      this.emitRealtimeUpdate();
    }, this.updateInterval);

    console.log("📊 Activity monitoring started");
  }

  // Stop real-time monitoring
  stopMonitoring() {
    if (!this.isRunning) return;

    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    console.log("⏹️ Activity monitoring stopped");
  }

  // Emit real-time update event
  emitRealtimeUpdate() {
    const update = {
      timestamp: new Date().toISOString(),
      metrics: this.getPerformanceMetrics(),
      traffic: this.generateTrafficData(1), // Last hour
      isMonitoring: this.isRunning,
    };

    // This would emit to a WebSocket or event system in a real implementation
    this.onRealtimeUpdate?.(update);
  }

  // Get summary statistics
  getSummary() {
    const mostActiveDay = this.getMostActiveDay();
    const mostActiveHour = this.getMostActiveHour();

    return {
      totalSessions: this.metrics.totalSessions,
      avgProcessingTime: `${this.metrics.avgProcessingTime.toFixed(2)}ms`,
      successRate: `${((this.metrics.successCount / this.metrics.totalSessions) * 100).toFixed(
        1,
      )}%`,
      activeStreak: this.metrics.activeStreak,
      mostActiveDay,
      mostActiveHour,
      lastActivity: this.metrics.lastActivity
        ? new Date(this.metrics.lastActivity).toLocaleString()
        : "Never",
    };
  }

  // Find most active day
  getMostActiveDay() {
    let maxActivity = 0;
    let mostActiveDay = null;

    if (this.metrics.dailyActivity instanceof Map) {
      for (const [date, activity] of this.metrics.dailyActivity.entries()) {
        if (activity > maxActivity) {
          maxActivity = activity;
          mostActiveDay = date;
        }
      }
    }

    return mostActiveDay || "None";
  }

  // Find most active hour
  getMostActiveHour() {
    let maxActivity = 0;
    let mostActiveHour = null;

    if (this.metrics.hourlyActivity instanceof Map) {
      for (const [hour, activity] of this.metrics.hourlyActivity.entries()) {
        if (activity > maxActivity) {
          maxActivity = activity;
          mostActiveHour = hour;
        }
      }
    }

    return mostActiveHour !== null ? `${mostActiveHour}:00` : "None";
  }
}

// Singleton instance
export const activityTracker = new ActivityTracker();
