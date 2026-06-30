/**
 * @file GradeDistribution.tsx
 * Presentational A–F grade-distribution chart for the side panel.
 *
 * Unlike the UC Santa Cruz original, this component does NOT fetch: TAMU grades
 * ship as a bundled snapshot and are aggregated in the background worker, so it
 * receives a ready `GradeSummary` and just renders it (recharts bar chart + GPA
 * / total / section-count stats).
 */

import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import type { GradeSummary, Letter } from '@/types';

const GRADE_COLORS: Record<Letter, string> = {
  A: '#22c55e',
  B: '#a3e635',
  C: '#fbbf24',
  D: '#f97316',
  F: '#ef4444',
};
const ORDER: Letter[] = ['A', 'B', 'C', 'D', 'F'];

export default function GradeDistribution({
  grades,
}: {
  grades: GradeSummary;
}) {
  const total = grades.totalStudents;
  if (total === 0) return null;

  const chartData = ORDER.map((grade) => ({
    grade,
    count: grades.letterGrades[grade] || 0,
    color: GRADE_COLORS[grade],
  }));

  // Screen-reader summary of the (otherwise opaque) SVG bar chart.
  const ariaSummary = `Grade distribution: ${chartData
    .map((d) => `${d.grade}, ${d.count} student${d.count === 1 ? '' : 's'}`)
    .join('; ')}. Total ${total}.`;

  return (
    <div className="grade-dist-section">
      <h4 className="grade-dist-title">Grade Distribution</h4>
      <div className="grade-dist-chart" role="img" aria-label={ariaSummary}>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart
            data={chartData}
            margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
          >
            <XAxis dataKey="grade" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip
              formatter={(v) => [
                `${v as number} students (${(((v as number) / total) * 100).toFixed(1)}%)`,
                'Count',
              ]}
            />
            <Bar dataKey="count" radius={[4, 4, 0, 0]}>
              {chartData.map((e, i) => (
                <Cell key={i} fill={e.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="grade-dist-stats">
        <div className="grade-dist-stat">
          <span className="grade-dist-stat-label">Avg GPA</span>
          <span className="grade-dist-stat-value">
            {grades.gpa?.toFixed(2) || 'N/A'}
          </span>
        </div>
        <div className="grade-dist-stat">
          <span className="grade-dist-stat-label">Total</span>
          <span className="grade-dist-stat-value">{total} students</span>
        </div>
        <div className="grade-dist-stat">
          <span className="grade-dist-stat-label">Sections</span>
          <span className="grade-dist-stat-value">{grades.sections}</span>
        </div>
      </div>
    </div>
  );
}
