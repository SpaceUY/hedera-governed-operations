"use client";

import { useState } from "react";
import { ScheduleStateCard } from "~~/components/explorer/ScheduleStateCard";
import { TopicMessagesList } from "~~/components/explorer/TopicMessagesList";
import { proofWallConfig } from "~~/config/proofWallConfig";

type EntityInputProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
};

function EntityInput({ label, value, onChange }: EntityInputProps) {
  const id = `explorer-${label.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <div className="form-control">
      <label className="label py-1" htmlFor={id}>
        <span className="label-text font-medium">{label}</span>
      </label>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        placeholder="0.0.12345"
        className="input input-bordered w-full font-mono"
        value={value}
        onChange={event => onChange(event.target.value.trim())}
      />
    </div>
  );
}

export default function ExplorerPage() {
  const [topicId, setTopicId] = useState(proofWallConfig.topicId);
  const [scheduleId, setScheduleId] = useState("");

  return (
    <div className="flex flex-col grow">
      <div className="w-full max-w-5xl mx-auto px-4 py-6 sm:py-8">
        <header className="rounded-2xl border border-base-300 bg-base-100 p-6 sm:p-8 shadow-sm mb-6 sm:mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight m-0">Mirror Explorer</h1>
          <p className="text-base-content/70 mt-2 mb-0">
            Read-only view of Mirror Node data. No wallet needed: topic messages are decoded client-side and schedules
            are polled until they settle.
          </p>
        </header>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="card border border-base-300 bg-base-100 shadow-sm" aria-labelledby="explorer-topic">
            <div className="card-body">
              <h2 id="explorer-topic" className="card-title">
                Topic messages
              </h2>
              <EntityInput label="Topic id" value={topicId} onChange={setTopicId} />
              <div className="mt-4">
                <TopicMessagesList topicId={topicId} />
              </div>
            </div>
          </section>

          <section className="card border border-base-300 bg-base-100 shadow-sm" aria-labelledby="explorer-schedule">
            <div className="card-body">
              <h2 id="explorer-schedule" className="card-title">
                Schedule state
              </h2>
              <EntityInput label="Schedule id" value={scheduleId} onChange={setScheduleId} />
              <div className="mt-4">
                <ScheduleStateCard scheduleId={scheduleId} />
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
