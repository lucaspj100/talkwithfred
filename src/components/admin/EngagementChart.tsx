import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  BarChart, Bar, PieChart, Pie, Cell, Legend,
} from "recharts";
import type { Point, LabelValue } from "@/lib/admin.functions";

const COLORS = ["#22c55e", "#0ea5e9", "#a855f7", "#f59e0b", "#ef4444", "#14b8a6", "#eab308", "#6366f1"];

function fmtDay(d: string) {
  const dt = new Date(d);
  return `${String(dt.getUTCDate()).padStart(2, "0")}/${String(dt.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function LineSeries({ title, data, color = "#22c55e" }: { title: string; data: Point[]; color?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card/40 p-4">
      <div className="mb-2 text-sm font-medium text-muted-foreground">{title}</div>
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data.map((d) => ({ ...d, dayLabel: fmtDay(d.day) }))}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="dayLabel" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
            <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
            <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))" }} />
            <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function BarDistribution({ title, data }: { title: string; data: LabelValue[] }) {
  return (
    <div className="rounded-2xl border border-border bg-card/40 p-4">
      <div className="mb-2 text-sm font-medium text-muted-foreground">{title}</div>
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
            <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
            <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))" }} />
            <Bar dataKey="value" fill="#22c55e" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function PieDistribution({ title, data }: { title: string; data: LabelValue[] }) {
  return (
    <div className="rounded-2xl border border-border bg-card/40 p-4">
      <div className="mb-2 text-sm font-medium text-muted-foreground">{title}</div>
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))" }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Pie data={data} dataKey="value" nameKey="label" outerRadius={70} label={{ fontSize: 10 }}>
              {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
