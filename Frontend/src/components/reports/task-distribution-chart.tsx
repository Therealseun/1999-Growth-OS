"use client";

import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
} from "recharts";

const DISTRIBUTION_COLORS: Record<string, string> = {
  Completed: "var(--color-luxe-success)",
  "In progress": "var(--color-luxe-info)",
  Pending: "var(--color-luxe-warning)",
  Blocked: "var(--color-luxe-danger)",
};

type DistributionRow = { name?: string; value?: number; count?: number };

export function TaskDistributionChart({ data }: { data: DistributionRow[] }) {
  const chartData = data
    .map((row) => ({
      name: row.name ?? "Other",
      value: row.value ?? row.count ?? 0,
    }))
    .filter((row) => row.value > 0);

  return (
    <div className="h-48">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={chartData}
            dataKey="value"
            nameKey="name"
            innerRadius={45}
            outerRadius={70}
            paddingAngle={2}
          >
            {chartData.map((row, i) => (
              <Cell
                key={i}
                fill={DISTRIBUTION_COLORS[row.name] ?? "var(--color-luxe-accent)"}
              />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              background: "var(--color-luxe-surface-2)",
              border: "1px solid var(--color-luxe-border)",
              borderRadius: 8,
              color: "var(--color-luxe-text)",
            }}
          />
          <Legend wrapperStyle={{ fontSize: 12, color: "var(--color-luxe-muted)" }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
