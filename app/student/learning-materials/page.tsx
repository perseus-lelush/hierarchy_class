"use client";

import { useMemo, useState } from "react";
import { useMaterials } from "@/lib/materialsStore";
import { InlineLoader } from "@/components/ui/Loading";

export default function LearningMaterialsPage() {
  const { materials, loading, error } = useMaterials();
  const [subjectFilter, setSubjectFilter] = useState("All");
  const [levelFilter, setLevelFilter] = useState("All");

  const subjects = useMemo(
    () => Array.from(new Set(materials.map((m) => m.subject))).sort(),
    [materials]
  );
  const levels = useMemo(
    () => Array.from(new Set(materials.map((m) => m.levelLabel).filter(Boolean))) as string[],
    [materials]
  );

  const filtered = useMemo(
    () =>
      materials.filter((material) => {
        const subjectMatch = subjectFilter === "All" || material.subject === subjectFilter;
        const levelMatch = levelFilter === "All" || (material.levelLabel ?? "All Levels") === levelFilter;
        return subjectMatch && levelMatch;
      }),
    [materials, subjectFilter, levelFilter]
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-6">
          <select
            value={subjectFilter}
            onChange={(e) => setSubjectFilter(e.target.value)}
            className="border-b border-base bg-transparent px-1 py-2 text-sm font-semibold text-navy outline-none focus:border-accent"
          >
            <option value="All">All subjects</option>
            {subjects.map((subject) => (
              <option key={subject} value={subject}>{subject}</option>
            ))}
          </select>
          <select
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value)}
            className="border-b border-base bg-transparent px-1 py-2 text-sm font-semibold text-navy outline-none focus:border-accent"
          >
            <option value="All">All levels</option>
            {levels.map((level) => (
              <option key={level} value={level}>{level}</option>
            ))}
          </select>
        </div>
        <span className="text-xs font-semibold text-muted">
          {filtered.length} resource{filtered.length === 1 ? "" : "s"}
        </span>
      </div>

      {loading ? (
        <InlineLoader label="Loading materials..." />
      ) : error ? (
        <p className="text-sm text-warn">{error}</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted">No learning materials available for these filters yet.</p>
      ) : (
        <div className="divide-y divide-[var(--border)]">
          {filtered.map((material) => (
            <div key={material.id} className="py-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.25em] text-muted">{material.subject}</p>
                  <h2 className="mt-2 text-lg font-semibold text-navy">{material.title}</h2>
                </div>
                <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-accent">
                  {material.type}
                </span>
              </div>
              {material.description && (
                <p className="mt-3 text-sm leading-6 text-muted">{material.description}</p>
              )}
              <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-muted">
                <span>{material.levelLabel ?? "All levels"}</span>
                <span>Uploaded by {material.uploaderName ?? "a teacher"}</span>
                <span>{new Date(material.uploadDate).toLocaleDateString()}</span>
              </div>
              {material.url ? (
                <a
                  href={material.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 inline-block rounded-full bg-navy px-4 py-2 text-xs font-semibold text-white transition hover-bg-accent-token hover-text-on-accent"
                >
                  Open resource -&gt;
                </a>
              ) : (
                <p className="mt-4 text-xs text-muted">No file attached to this resource yet.</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
