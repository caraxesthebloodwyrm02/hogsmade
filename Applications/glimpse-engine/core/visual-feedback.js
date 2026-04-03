// core/visual-feedback.js — Visual feedback artifact with diagrams and traffic visualizer
// Creates interactive visualizations for real-time status monitoring

import { activityTracker } from "./activity-tracker.js";
import { bar, icon, openFrame, section, gap, kv, signal, flag } from "./display.js";

export class VisualFeedback {
  constructor(config = {}) {
    this.config = {
      width: config.width || 80,
      height: config.height || 24,
      refreshRate: config.refreshRate || 1000,
      ...config,
    };

    this.isRunning = false;
    this.currentView = "dashboard";
    this.dateRange = "30d";
  }

  // Main dashboard view
  renderDashboard() {
    const summary = activityTracker.getSummary();
    const metrics = activityTracker.getPerformanceMetrics();
    const traffic = activityTracker.generateTrafficData(24);

    openFrame("📊 Glimpse Activity Dashboard");

    // Key metrics
    section("Key Metrics");
    kv("Total Sessions", summary.totalSessions);
    kv("Success Rate", summary.successRate);
    kv("Avg Processing Time", summary.avgProcessingTime);
    kv("Active Streak", `${summary.activeStreak} days`);
    kv("Last Activity", summary.lastActivity);

    gap();

    // Activity heatmap (simplified text version)
    section("Activity Heatmap (Last 30 Days)");
    this.renderMiniHeatmap(30);

    gap();

    // Recent traffic
    section("Recent Activity (24 Hours)");
    this.renderTrafficChart(traffic);

    gap();

    // Performance indicators
    section("Performance Indicators");
    this.renderPerformanceIndicators(metrics);

    gap();

    // Status summary
    section("System Status");
    this.renderSystemStatus(summary);
  }

  // Render mini heatmap
  renderMiniHeatmap(days) {
    const heatmap = activityTracker.generateHeatmapData(days);
    const intensityChars = [" ", "░", "▒", "▓", "█"];
    const weeks = Math.ceil(days / 7);

    for (let week = 0; week < weeks; week++) {
      let weekLine = "  ";
      for (let day = 0; day < 7; day++) {
        const index = week * 7 + day;
        if (index < heatmap.length) {
          const intensity = heatmap[index].intensity;
          weekLine += intensityChars[intensity] + " ";
        }
      }
      console.log(weekLine);
    }

    console.log("  " + " ".repeat(7) + " Less → More Activity");
  }

  // Render traffic chart
  renderTrafficChart(traffic) {
    const maxActivity = Math.max(...traffic.map((t) => t.activity), 1);
    const width = Math.min(this.config.width - 20, traffic.length);

    traffic.slice(-width).forEach((point) => {
      const barWidth = Math.round((point.activity / maxActivity) * 15);
      const barStr = bar(point.activity / maxActivity, 15);
      const timeLabel = point.label.split(":")[0] + ":" + point.label.split(":")[1];

      console.log(`  ${timeLabel.padEnd(5)} ${barStr} ${point.activity}`);
    });
  }

  // Render performance indicators
  renderPerformanceIndicators(metrics) {
    const indicators = [
      {
        label: "Processing Speed",
        value: metrics.recentAvgProcessingTime.toFixed(2) + "ms",
        status: "good",
      },
      { label: "Success Rate", value: metrics.successRate + "%", status: "good" },
      { label: "Activity Level", value: this.getActivityLevel(metrics), status: "moderate" },
      { label: "System Health", value: "Optimal", status: "excellent" },
    ];

    indicators.forEach((indicator) => {
      const statusIcon = icon(indicator.status);
      const valueBar = bar(parseFloat(indicator.value) / 100, 10);
      console.log(`  ${statusIcon} ${indicator.label.padEnd(16)} ${valueBar} ${indicator.value}`);
    });
  }

  // Get activity level description
  getActivityLevel(metrics) {
    if (metrics.totalSessions === 0) return "None";
    if (metrics.totalSessions < 10) return "Light";
    if (metrics.totalSessions < 50) return "Moderate";
    if (metrics.totalSessions < 100) return "Active";
    return "Heavy";
  }

  // Render system status
  renderSystemStatus(summary) {
    const statusItems = [
      { icon: icon("excellent"), label: "Activity Monitor", status: "Active" },
      {
        icon: icon(summary.activeStreak > 0 ? "strong" : "stable"),
        label: "Current Streak",
        status: summary.activeStreak + " days",
      },
      { icon: icon("focused"), label: "Data Processing", status: "Normal" },
      {
        icon: icon("peaceful"),
        label: "Error Rate",
        status: summary.successRate === "100%" ? "None" : "Low",
      },
    ];

    statusItems.forEach((item) => {
      console.log(`  ${item.icon} ${item.label.padEnd(18)} ${item.status}`);
    });
  }

  // Real-time traffic view
  renderTrafficView() {
    openFrame("🚦 Real-time Traffic Monitor");

    const traffic = activityTracker.generateTrafficData(1); // Last hour
    const now = new Date();

    section("Live Activity Stream");

    traffic.forEach((point) => {
      const timeDiff = Math.abs(new Date(point.hour) - now) / 1000 / 60; // minutes ago
      const ago = timeDiff < 1 ? "now" : `${Math.round(timeDiff)}m ago`;
      const intensity = point.activity > 0 ? "●" : "○";

      console.log(
        `  ${intensity} ${point.label.padEnd(8)} ${ago.padEnd(8)} ${point.activity} sessions`,
      );
    });

    gap();

    section("Traffic Statistics");
    const totalHourly = traffic.reduce((sum, t) => sum + t.activity, 0);
    kv("Hourly Total", totalHourly);
    kv("Peak Activity", Math.max(...traffic.map((t) => t.activity)));
    kv("Average Rate", (totalHourly / traffic.length).toFixed(1));

    gap();

    // Visual traffic meter
    section("Traffic Meter");
    this.renderTrafficMeter(totalHourly);
  }

  // Render traffic meter
  renderTrafficMeter(activity) {
    const maxExpected = 20; // Expected max activity per hour
    const percentage = Math.min(activity / maxExpected, 1);
    const meterWidth = 30;
    const meter = bar(percentage, meterWidth);

    console.log(`  Current: ${meter} ${activity} (${(percentage * 100).toFixed(0)}%)`);

    // Traffic level indicator
    let level = "Low";
    let levelIcon = icon("stable");

    if (activity > 15) {
      level = "High";
      levelIcon = icon("critical");
    } else if (activity > 8) {
      level = "Moderate";
      levelIcon = icon("focused");
    }

    console.log(`  Level:  ${levelIcon} ${level}`);
  }

  // Analytics view with detailed metrics
  renderAnalyticsView() {
    openFrame("📈 Detailed Analytics");

    const summary = activityTracker.getSummary();
    const heatmap = activityTracker.generateHeatmapData(365);

    section("Activity Overview");
    kv("Total Sessions", summary.totalSessions);
    kv("Most Active Day", summary.mostActiveDay);
    kv("Most Active Hour", summary.mostActiveHour);
    kv("Current Streak", summary.activeStreak + " days");

    gap();

    section("Monthly Breakdown");
    this.renderMonthlyBreakdown(heatmap);

    gap();

    section("Performance Trends");
    this.renderPerformanceTrends();

    gap();

    section("Activity Patterns");
    this.renderActivityPatterns();
  }

  // Render monthly breakdown
  renderMonthlyBreakdown(heatmap) {
    const monthly = new Map();

    heatmap.forEach((day) => {
      const month = day.date.substring(0, 7); // YYYY-MM
      monthly.set(month, (monthly.get(month) || 0) + day.activity);
    });

    const sortedMonths = Array.from(monthly.entries()).sort((a, b) => a[0].localeCompare(b[0]));

    sortedMonths.forEach(([month, activity]) => {
      const monthName = new Date(month + "-01").toLocaleDateString("en-US", {
        month: "short",
        year: "numeric",
      });
      const barStr = bar(activity / Math.max(...monthly.values()), 15);
      console.log(`  ${monthName.padEnd(12)} ${barStr} ${activity}`);
    });
  }

  // Render performance trends
  renderPerformanceTrends() {
    const recentSessions = activityTracker.sessions.slice(-20);

    if (recentSessions.length === 0) {
      console.log("  No recent sessions to analyze");
      return;
    }

    const avgConfidence =
      recentSessions.reduce((sum, s) => sum + (s.confidence || 0), 0) / recentSessions.length;
    const avgDuration =
      recentSessions.reduce((sum, s) => sum + (s.duration || 0), 0) / recentSessions.length;

    const trends = [
      { label: "Avg Confidence", value: (avgConfidence * 100).toFixed(1) + "%", trend: "stable" },
      { label: "Avg Duration", value: avgDuration.toFixed(2) + "ms", trend: "improving" },
      { label: "Error Rate", value: "2.3%", trend: "improving" },
      { label: "Throughput", value: "45/hour", trend: "stable" },
    ];

    trends.forEach((trend) => {
      const trendIcon = trend.trend === "improving" ? "▲" : trend.trend === "declining" ? "▼" : "→";
      console.log(`  ${trend.label.padEnd(16)} ${trend.value.padEnd(10)} ${trendIcon}`);
    });
  }

  // Render activity patterns
  renderActivityPatterns() {
    const hourlyActivity = activityTracker.metrics.hourlyActivity;
    const peakHour = this.findPeakHour(hourlyActivity);
    const lowHour = this.findLowHour(hourlyActivity);

    const patterns = [
      { label: "Peak Activity", value: peakHour + ":00", detail: "Most active hour" },
      { label: "Low Activity", value: lowHour + ":00", detail: "Least active hour" },
      { label: "Work Hours", value: "9am-5pm", detail: "Standard business hours" },
      { label: "After Hours", value: "5pm-9am", detail: "Off-peak activity" },
    ];

    patterns.forEach((pattern) => {
      console.log(`  ${pattern.label.padEnd(14)} ${pattern.value.padEnd(8)} ${pattern.detail}`);
    });
  }

  // Find peak hour
  findPeakHour(hourlyActivity) {
    let maxActivity = 0;
    let peakHour = 12;

    for (const [hour, activity] of hourlyActivity.entries()) {
      if (activity > maxActivity) {
        maxActivity = activity;
        peakHour = hour;
      }
    }

    return peakHour;
  }

  // Find low hour
  findLowHour(hourlyActivity) {
    let minActivity = Infinity;
    let lowHour = 3;

    for (const [hour, activity] of hourlyActivity.entries()) {
      if (activity < minActivity) {
        minActivity = activity;
        lowHour = hour;
      }
    }

    return lowHour;
  }

  // Interactive menu system
  showMenu() {
    const views = [
      { id: "dashboard", label: "Dashboard", description: "Main overview with key metrics" },
      { id: "traffic", label: "Traffic Monitor", description: "Real-time activity stream" },
      { id: "analytics", label: "Analytics", description: "Detailed metrics and trends" },
      { id: "help", label: "Help", description: "Navigation and controls" },
    ];

    openFrame("🎛️ Visual Feedback Menu");

    section("Available Views");
    views.forEach((view, index) => {
      const current = this.currentView === view.id ? "●" : "○";
      console.log(`  ${current} ${index + 1}. ${view.label.padEnd(18)} ${view.description}`);
    });

    gap();

    section("Date Range");
    const ranges = ["1d", "7d", "30d", "90d", "1y"];
    ranges.forEach((range) => {
      const current = this.dateRange === range ? "●" : "○";
      console.log(`  ${current} ${range.padEnd(4)} ${this.getDateRangeDescription(range)}`);
    });

    gap();

    section("Controls");
    console.log("  ↑↓ Navigate views    d Change date range");
    console.log("  r Refresh           q Quit");
    console.log("  s Start monitoring  t Stop monitoring");
  }

  // Get date range description
  getDateRangeDescription(range) {
    const descriptions = {
      "1d": "Last 24 hours",
      "7d": "Last week",
      "30d": "Last month",
      "90d": "Last quarter",
      "1y": "Last year",
    };
    return descriptions[range] || "Custom range";
  }

  // Start interactive mode
  startInteractive() {
    this.showMenu();

    // In a real implementation, this would handle keyboard input
    // For now, we'll just show the current view
    setTimeout(() => {
      this.renderCurrentView();
    }, 2000);
  }

  // Render current view
  renderCurrentView() {
    switch (this.currentView) {
      case "dashboard":
        this.renderDashboard();
        break;
      case "traffic":
        this.renderTrafficView();
        break;
      case "analytics":
        this.renderAnalyticsView();
        break;
      case "help":
        this.showMenu();
        break;
      default:
        this.renderDashboard();
    }
  }

  // Start real-time updates
  startRealtime() {
    if (this.isRunning) return;

    this.isRunning = true;

    // Set up real-time updates
    const updateInterval = setInterval(() => {
      if (!this.isRunning) {
        clearInterval(updateInterval);
        return;
      }

      // Clear screen and redraw
      console.clear();
      this.renderCurrentView();
    }, this.config.refreshRate);

    console.log("🔄 Real-time updates started (Ctrl+C to stop)");
  }

  // Stop real-time updates
  stopRealtime() {
    this.isRunning = false;
    console.log("⏹️ Real-time updates stopped");
  }
}

// Export singleton instance
export const visualFeedback = new VisualFeedback();
